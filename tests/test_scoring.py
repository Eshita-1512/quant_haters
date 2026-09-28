from decimal import Decimal

import pytest

from app.services.scoring import score_binary, score_signals


def test_binary_score_is_perfect_for_perfect_predictions() -> None:
    result = score_binary([0, 1, 0, 1], [0, 1, 0, 1])
    assert result.score == pytest.approx(1.0)
    assert result.balanced_accuracy == pytest.approx(1.0)
    assert result.mcc == pytest.approx(1.0)


def test_binary_score_normalizes_mcc() -> None:
    result = score_binary([1, 1, 0, 0], [1, 0, 1, 0])
    assert result.balanced_accuracy == pytest.approx(0.5)
    assert result.mcc == pytest.approx(0.0)
    assert result.score == pytest.approx(0.5)


def test_signal_score_penalizes_position_changes() -> None:
    stable = score_signals([Decimal("1")] * 4, [Decimal("0.01")] * 4)
    changing = score_signals(
        [Decimal("1"), Decimal("-1"), Decimal("1"), Decimal("-1")],
        [Decimal("0.01")] * 4,
    )
    assert changing.transaction_cost_penalty == pytest.approx(0.003)
    assert stable.transaction_cost_penalty == 0
    assert changing.score < stable.score
