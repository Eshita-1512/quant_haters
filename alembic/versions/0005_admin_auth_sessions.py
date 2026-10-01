"""Add revocable administrator sessions.

Revision ID: 0005_admin_auth_sessions
Revises: 0004_submission_rate_limits
"""

from collections.abc import Sequence

from alembic import op


revision: str = "0005_admin_auth_sessions"
down_revision: str | None = "0004_submission_rate_limits"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS admin_auth_sessions (
            id UUID PRIMARY KEY,
            admin_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
            token_hash VARCHAR(64) NOT NULL UNIQUE,
            expires_at TIMESTAMPTZ NOT NULL,
            revoked_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS admin_auth_sessions")
