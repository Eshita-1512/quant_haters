from app.models import DatasetRelease, PredictionRow, SignalRow, TeamAssignment


def test_assignment_exposes_team_windows() -> None:
    names = set(TeamAssignment.__table__.columns.keys())
    assert {"train_start", "train_end", "predict_start", "predict_end"} <= names


def test_prediction_stores_confidence() -> None:
    assert "confidence" in PredictionRow.__table__.columns


def test_round_three_uses_signal() -> None:
    assert "signal" in SignalRow.__table__.columns


def test_dataset_release_round_must_match_assignment_round() -> None:
    targets = {
        tuple(element.target_fullname for element in constraint.elements)
        for constraint in DatasetRelease.__table__.foreign_key_constraints
    }
    assert ("team_assignments.id", "team_assignments.round_id") in targets
