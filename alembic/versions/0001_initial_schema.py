"""Create the initial Quant Challenge schema.

Revision ID: 0001_initial_schema
Revises: None
"""

from collections.abc import Sequence

from alembic import op

from app.database import Base
from app import models  # noqa: F401


revision: str = "0001_initial_schema"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ORIGINAL_TABLE_NAMES = {
    "teams",
    "auth_sessions",
    "stocks",
    "rounds",
    "team_assignments",
    "dataset_releases",
    "download_events",
    "submissions",
    "prediction_rows",
    "signal_rows",
    "scores",
    "admin_users",
    "event_state",
    "admin_audit_log",
}


def upgrade() -> None:
    # This is the immutable baseline revision. Later schema changes must use
    # explicit Alembic operations in new revisions.
    Base.metadata.create_all(bind=op.get_bind(), checkfirst=False)


def downgrade() -> None:
    for table in reversed(Base.metadata.sorted_tables):
        if table.name in ORIGINAL_TABLE_NAMES:
            op.drop_table(table.name)
