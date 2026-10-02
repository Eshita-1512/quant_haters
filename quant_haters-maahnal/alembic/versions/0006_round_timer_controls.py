"""Store paused round timers and the Flash Crash trigger time.

Revision ID: 0006_round_timer_controls
Revises: 0005_admin_auth_sessions
"""

from collections.abc import Sequence

from alembic import op


revision: str = "0006_round_timer_controls"
down_revision: str | None = "0005_admin_auth_sessions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE rounds ADD COLUMN IF NOT EXISTS paused_remaining_seconds INTEGER")
    op.execute("ALTER TABLE event_state ADD COLUMN IF NOT EXISTS flash_crash_triggered_at TIMESTAMPTZ")


def downgrade() -> None:
    op.execute("ALTER TABLE event_state DROP COLUMN IF EXISTS flash_crash_triggered_at")
    op.execute("ALTER TABLE rounds DROP COLUMN IF EXISTS paused_remaining_seconds")
