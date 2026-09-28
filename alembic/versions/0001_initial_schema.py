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


def upgrade() -> None:
    # This is the immutable baseline revision. Later schema changes must use
    # explicit Alembic operations in new revisions.
    Base.metadata.create_all(bind=op.get_bind(), checkfirst=False)


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind(), checkfirst=False)

