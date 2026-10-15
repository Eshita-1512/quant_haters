"""Add look-ahead results, score adjustments and team notices.

Revision ID: 0008_integrity
Revises: 0007_leaderboard_snapshot_final
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0008_integrity"
down_revision: str | None = "0007_leaderboard_snapshot_final"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "lookahead_results",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("check_run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "submission_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("submissions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("team_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("teams.id"), nullable=False),
        sa.Column("round_id", sa.Integer(), sa.ForeignKey("rounds.id"), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("worst_rule", sa.String(length=30), nullable=True),
        sa.Column("worst_agreement", sa.Numeric(5, 3), nullable=True),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "checked_by_admin_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("admin_users.id"), nullable=False
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_lookahead_results_check_run_id", "lookahead_results", ["check_run_id"])
    op.create_index("ix_lookahead_results_round_created", "lookahead_results", ["round_id", "created_at"])

    op.create_table(
        "score_adjustments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("team_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("teams.id"), nullable=False),
        sa.Column("round_id", sa.Integer(), sa.ForeignKey("rounds.id"), nullable=False),
        sa.Column("points", sa.Numeric(8, 2), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("check_run_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_by_admin_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("admin_users.id"), nullable=False
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "revoked_by_admin_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("admin_users.id"), nullable=True
        ),
        sa.CheckConstraint("points > 0", name="ck_score_adjustments_points_positive"),
        sa.CheckConstraint("kind IN ('lookahead', 'manual')", name="ck_score_adjustments_kind"),
        sa.CheckConstraint("char_length(reason) <= 500", name="ck_score_adjustments_reason_length"),
    )
    op.create_index(
        "uq_score_adjustments_active_lookahead",
        "score_adjustments",
        ["team_id", "round_id"],
        unique=True,
        postgresql_where=sa.text("kind = 'lookahead' AND revoked_at IS NULL"),
    )

    op.create_table(
        "team_notices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("team_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("teams.id"), nullable=False),
        sa.Column("round_id", sa.Integer(), sa.ForeignKey("rounds.id"), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column(
            "created_by_admin_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("admin_users.id"), nullable=False
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_team_notices_team_id", "team_notices", ["team_id"])


def downgrade() -> None:
    op.drop_index("ix_team_notices_team_id", table_name="team_notices")
    op.drop_table("team_notices")
    op.drop_index("uq_score_adjustments_active_lookahead", table_name="score_adjustments")
    op.drop_table("score_adjustments")
    op.drop_index("ix_lookahead_results_round_created", table_name="lookahead_results")
    op.drop_index("ix_lookahead_results_check_run_id", table_name="lookahead_results")
    op.drop_table("lookahead_results")
