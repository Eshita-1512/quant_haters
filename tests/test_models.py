from app.models import (
    DatasetRelease,
    LeaderboardSnapshot,
    LeaderboardSnapshotEntry,
    PredictionRow,
    SignalRow,
    SubmissionRateLimit,
    TeamAssignment,
)


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


def test_leaderboard_snapshot_models_freeze_rank_and_submission_count() -> None:
    assert {"round_id", "published_by_admin_id"} <= set(
        LeaderboardSnapshot.__table__.columns.keys()
    )
    assert {
        "snapshot_id",
        "rank",
        "team_id",
        "team_name",
        "score",
        "submissions",
    } <= set(LeaderboardSnapshotEntry.__table__.columns.keys())


def test_submission_rate_limit_has_one_row_per_team() -> None:
    assert SubmissionRateLimit.__table__.primary_key.columns.keys() == ["team_id"]
    assert "last_attempt_at" in SubmissionRateLimit.__table__.columns
