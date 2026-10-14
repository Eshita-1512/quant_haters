"""Scoring for the Quant ML Trading Challenge.

Pure-Python port of the reference engine in ``quant-challenge/scoring`` (no numpy / sklearn
needed in the API image). All scores are on a 0-100 scale.

Rounds 1 & 2 (UP=1 / DOWN=0 predictions)
    BA_adj  = clip((balanced_accuracy - 0.4) / 0.6, 0, 1)   -> random guessing (0.5) = ~0.16
    MCC_adj = clip((mcc + 0.2) / 1.2, 0, 1)                 -> random guessing (0.0) = ~0.16
    score   = 100 * (0.5 * BA_adj + 0.5 * MCC_adj)

Round 3 (positions in [-1, 1], ``returns`` = return earned by holding row t's position)
    net_t       = position_t * return_t - FEE * |position_t - position_(t-1)|   (starts flat)
    alpha_score = sharpe(net) - DD_PENALTY * max_drawdown(equity)
    score       = 100 * clip(alpha_score / SHARPE_CAP, 0, 1)
    A constant (zero-variance) signal is a lazy buy-and-hold / short-and-hold bet, not a
    strategy, so its score is multiplied by (1 - STATIC_SIGNAL_PENALTY).
"""
import math
import statistics
from dataclasses import dataclass
from decimal import Decimal

W_BA = 0.5
W_MCC = 0.5
FEE = 0.0005  # per unit of turnover (5 bps) - still punishes noisy, high-turnover models
DD_PENALTY = 2.0
SHARPE_CAP = 8.0  # alpha at which the score maxes out; lowered from 20 so realistic edges are visible
STATIC_SIGNAL_PENALTY = 0.90  # constant signal is not a strategy: keep only 10% of its score
STATIC_SIGNAL_TOLERANCE = 1e-9
PERIODS_PER_YEAR = 252


@dataclass(frozen=True)
class BinaryScore:
    score: float
    balanced_accuracy: float
    mcc: float


@dataclass(frozen=True)
class SignalScore:
    score: float
    sharpe_ratio: float
    max_drawdown: float
    transaction_cost_penalty: float
    alpha_score: float = 0.0


def _clip(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def score_binary(predictions: list[int], targets: list[int]) -> BinaryScore:
    if not predictions or len(predictions) != len(targets):
        raise ValueError("Predictions and targets must be non-empty and equal length.")
    pairs = list(zip(predictions, targets, strict=True))
    tp = sum(p == 1 and t == 1 for p, t in pairs)
    tn = sum(p == 0 and t == 0 for p, t in pairs)
    fp = sum(p == 1 and t == 0 for p, t in pairs)
    fn = sum(p == 0 and t == 1 for p, t in pairs)
    # Average recall over the classes that actually appear in the targets.
    recalls = []
    if tp + fn:
        recalls.append(tp / (tp + fn))
    if tn + fp:
        recalls.append(tn / (tn + fp))
    balanced_accuracy = sum(recalls) / len(recalls)
    denominator = math.sqrt((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn))
    mcc = ((tp * tn) - (fp * fn)) / denominator if denominator else 0.0
    score = 100 * (
        W_BA * _clip((balanced_accuracy - 0.4) / 0.6, 0.0, 1.0) + W_MCC * _clip((mcc + 0.2) / 1.2, 0.0, 1.0)
    )
    return BinaryScore(round(score, 2), balanced_accuracy, mcc)


def score_signals(signals: list[Decimal], returns: list[Decimal]) -> SignalScore:
    if not signals or len(signals) != len(returns):
        raise ValueError("Signals and returns must be non-empty and equal length.")
    positions = [float(s) for s in signals]
    rets = [float(r) for r in returns]

    previous = 0.0
    net: list[float] = []
    total_cost = 0.0
    for position, ret in zip(positions, rets, strict=True):
        cost = FEE * abs(position - previous)
        total_cost += cost
        net.append(position * ret - cost)
        previous = position

    deviation = statistics.stdev(net) if len(net) > 1 else 0.0
    sharpe = (statistics.fmean(net) / deviation) * math.sqrt(PERIODS_PER_YEAR) if deviation > 1e-12 else 0.0

    equity = peak = 1.0
    max_drawdown = 0.0
    for value in net:
        equity *= 1 + value
        peak = max(peak, equity)
        max_drawdown = max(max_drawdown, (peak - equity) / peak)

    alpha = sharpe - DD_PENALTY * max_drawdown
    score = 100 * _clip(alpha / SHARPE_CAP, 0.0, 1.0)
    if len(positions) > 1 and statistics.pstdev(positions) < STATIC_SIGNAL_TOLERANCE:
        score *= 1 - STATIC_SIGNAL_PENALTY
    return SignalScore(round(score, 2), sharpe, max_drawdown, total_cost, alpha)
