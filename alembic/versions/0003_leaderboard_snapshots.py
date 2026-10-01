"""Add frozen leaderboard snapshots.

Revision ID: 0003_leaderboard_snapshots
Revises: 0002_assignment_round_integrity
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0003_leaderboard_snapshots"
down_revision: str | None = "0002_assignment_round_integrity"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "leaderboard_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("round_id", sa.Integer(), nullable=False),
        sa.Column("published_by_admin_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["published_by_admin_id"], ["admin_users.id"]),
        sa.ForeignKeyConstraint(["round_id"], ["rounds.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "leaderboard_snapshot_entries",
        sa.Column("snapshot_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("rank", sa.Integer(), nullable=False),
        sa.Column("team_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("team_name", sa.String(length=150), nullable=False),
        sa.Column("score", sa.Numeric(12, 6), nullable=False),
        sa.Column("submissions", sa.Integer(), nullable=False),
        sa.CheckConstraint("rank > 0"),
        sa.CheckConstraint("submissions >= 0"),
        sa.ForeignKeyConstraint(["snapshot_id"], ["leaderboard_snapshots.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"]),
        sa.PrimaryKeyConstraint("snapshot_id", "rank"),
    )


def downgrade() -> None:
    op.drop_table("leaderboard_snapshot_entries")
    op.drop_table("leaderboard_snapshots")
