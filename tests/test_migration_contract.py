from alembic.config import Config
from alembic.script import ScriptDirectory

from app.database import Base
from app import models  # noqa: F401


def test_initial_migration_is_single_head() -> None:
    scripts = ScriptDirectory.from_config(Config("alembic.ini"))
    assert scripts.get_heads() == ["0002_assignment_round_integrity"]


def test_metadata_contains_all_approved_tables() -> None:
    assert set(Base.metadata.tables) == {
        "teams", "auth_sessions", "stocks", "rounds", "team_assignments",
        "dataset_releases", "download_events", "submissions", "prediction_rows",
        "signal_rows", "scores", "admin_users", "event_state", "admin_audit_log",
    }
