"""Add is_final flag to leaderboard snapshots.

Revision ID: 0007_leaderboard_snapshot_final
Revises: 0006_round_timer_controls
"""

from collections.abc import Sequence

from alembic import op


revision: str = "0007_leaderboard_snapshot_final"
down_revision: str | None = "0006_round_timer_controls"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE leaderboard_snapshots ADD COLUMN IF NOT EXISTS is_final BOOLEAN NOT NULL DEFAULT FALSE")


def downgrade() -> None:
    op.execute("ALTER TABLE leaderboard_snapshots DROP COLUMN IF EXISTS is_final")
