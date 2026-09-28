"""Ensure a dataset release belongs to an assignment in the same round.

Revision ID: 0002_assignment_round_integrity
Revises: 0001_initial_schema
"""

from collections.abc import Sequence

from alembic import op


revision: str = "0002_assignment_round_integrity"
down_revision: str | None = "0001_initial_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # The guards support both databases created by the original baseline and
    # fresh databases created after the model-level constraints were named.
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'uq_team_assignments_id_round_id'
            ) THEN
                ALTER TABLE team_assignments
                ADD CONSTRAINT uq_team_assignments_id_round_id UNIQUE (id, round_id);
            END IF;
        END $$
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'fk_dataset_releases_assignment_round'
            ) THEN
                ALTER TABLE dataset_releases
                ADD CONSTRAINT fk_dataset_releases_assignment_round
                FOREIGN KEY (assignment_id, round_id)
                REFERENCES team_assignments (id, round_id);
            END IF;
        END $$
        """
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_dataset_releases_assignment_round",
        "dataset_releases",
        type_="foreignkey",
    )
    op.drop_constraint(
        "uq_team_assignments_id_round_id",
        "team_assignments",
        type_="unique",
    )
