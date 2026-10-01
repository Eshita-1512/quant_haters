"""Add database-backed submission rate limits.

Revision ID: 0004_submission_rate_limits
Revises: 0003_leaderboard_snapshots
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0004_submission_rate_limits"
down_revision: str | None = "0003_leaderboard_snapshots"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "submission_rate_limits",
        sa.Column("team_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("last_attempt_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("team_id"),
    )


def downgrade() -> None:
    op.drop_table("submission_rate_limits")
