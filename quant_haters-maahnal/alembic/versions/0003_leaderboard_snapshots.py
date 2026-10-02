"""Add frozen leaderboard snapshots.

Revision ID: 0003_leaderboard_snapshots
Revises: 0002_assignment_round_integrity
"""

from collections.abc import Sequence

from alembic import op


revision: str = "0003_leaderboard_snapshots"
down_revision: str | None = "0002_assignment_round_integrity"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
            id UUID PRIMARY KEY,
            round_id INTEGER NOT NULL REFERENCES rounds(id),
            published_by_admin_id UUID NOT NULL REFERENCES admin_users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS leaderboard_snapshot_entries (
            snapshot_id UUID NOT NULL REFERENCES leaderboard_snapshots(id) ON DELETE CASCADE,
            rank INTEGER NOT NULL CHECK (rank > 0),
            team_id UUID NOT NULL REFERENCES teams(id),
            team_name VARCHAR(150) NOT NULL,
            score NUMERIC(12, 6) NOT NULL,
            submissions INTEGER NOT NULL CHECK (submissions >= 0),
            PRIMARY KEY (snapshot_id, rank)
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS leaderboard_snapshot_entries")
    op.execute("DROP TABLE IF EXISTS leaderboard_snapshots")
