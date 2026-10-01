from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

from app.database import Base
from app import models  # noqa: F401


def test_initial_migration_is_single_head() -> None:
    scripts = ScriptDirectory.from_config(Config("alembic.ini"))
    assert scripts.get_heads() == ["0005_admin_auth_sessions"]


def test_metadata_contains_all_approved_tables() -> None:
    assert set(Base.metadata.tables) == {
        "teams", "auth_sessions", "stocks", "rounds", "team_assignments",
        "dataset_releases", "download_events", "submissions", "prediction_rows",
        "signal_rows", "scores", "admin_users", "event_state", "admin_audit_log",
        "leaderboard_snapshots", "leaderboard_snapshot_entries",
        "submission_rate_limits",
        "admin_auth_sessions",
    }


def test_post_baseline_table_migrations_are_safe_for_fresh_databases() -> None:
    for filename in (
        "0003_leaderboard_snapshots.py",
        "0004_submission_rate_limits.py",
        "0005_admin_auth_sessions.py",
    ):
        source = (Path("alembic/versions") / filename).read_text(encoding="utf-8")
        assert "CREATE TABLE IF NOT EXISTS" in source
