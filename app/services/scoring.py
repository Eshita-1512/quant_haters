import math
import statistics
from dataclasses import dataclass
from decimal import Decimal


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


def score_binary(predictions: list[int], targets: list[int]) -> BinaryScore:
    if not predictions or len(predictions) != len(targets):
        raise ValueError("Predictions and targets must be non-empty and equal length.")
    tp = sum(p == 1 and t == 1 for p, t in zip(predictions, targets, strict=True))
    tn = sum(p == 0 and t == 0 for p, t in zip(predictions, targets, strict=True))
    fp = sum(p == 1 and t == 0 for p, t in zip(predictions, targets, strict=True))
    fn = sum(p == 0 and t == 1 for p, t in zip(predictions, targets, strict=True))
    recall_up = tp / (tp + fn) if tp + fn else 0.0
    recall_down = tn / (tn + fp) if tn + fp else 0.0
    balanced_accuracy = (recall_up + recall_down) / 2
    denominator = math.sqrt((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn))
    mcc = ((tp * tn) - (fp * fn)) / denominator if denominator else 0.0
    score = (0.60 * balanced_accuracy) + (0.40 * ((mcc + 1) / 2))
    return BinaryScore(score, balanced_accuracy, mcc)


def score_signals(signals: list[Decimal], returns: list[Decimal]) -> SignalScore:
    if not signals or len(signals) != len(returns):
        raise ValueError("Signals and returns must be non-empty and equal length.")
    strategy_returns = [float(signal * value) for signal, value in zip(signals, returns, strict=True)]
    mean_return = statistics.fmean(strategy_returns)
    deviation = statistics.stdev(strategy_returns) if len(strategy_returns) > 1 else 0.0
    sharpe = (mean_return / deviation) * math.sqrt(252) if deviation else 0.0
    equity = peak = 1.0
    max_drawdown = 0.0
    for value in strategy_returns:
        equity *= 1 + value
        peak = max(peak, equity)
        max_drawdown = max(max_drawdown, (peak - equity) / peak)
    changes = sum(abs(float(signals[i] - signals[i - 1])) > 0.05 for i in range(1, len(signals)))
    transaction_penalty = 0.001 * changes
    score = sharpe - (0.10 * max_drawdown) - transaction_penalty
    return SignalScore(score, sharpe, max_drawdown, transaction_penalty)
