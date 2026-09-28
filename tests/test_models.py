from app.models import PredictionRow, SignalRow, TeamAssignment


def test_assignment_exposes_team_windows() -> None:
    names = set(TeamAssignment.__table__.columns.keys())
    assert {"train_start", "train_end", "predict_start", "predict_end"} <= names


def test_prediction_stores_confidence() -> None:
    assert "confidence" in PredictionRow.__table__.columns


def test_round_three_uses_signal() -> None:
    assert "signal" in SignalRow.__table__.columns
