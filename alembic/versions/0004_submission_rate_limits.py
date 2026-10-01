"""Add database-backed submission rate limits.

Revision ID: 0004_submission_rate_limits
Revises: 0003_leaderboard_snapshots
"""

from collections.abc import Sequence

from alembic import op


revision: str = "0004_submission_rate_limits"
down_revision: str | None = "0003_leaderboard_snapshots"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS submission_rate_limits (
            team_id UUID PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
            last_attempt_at TIMESTAMPTZ NOT NULL
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS submission_rate_limits")
