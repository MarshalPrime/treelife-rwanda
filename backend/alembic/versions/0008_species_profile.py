"""Add harvest attributes and varieties to approved species.

Existing species stay blank. An administrator records harvest potential,
harvest type, and varieties. Field agents do not invent them.

Revision ID: 0008_species_profile
Revises: 0007_farmer_place
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008_species_profile"
down_revision: str | None = "0007_farmer_place"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("species", sa.Column("harvest_potential", sa.Boolean(), nullable=True))
    op.add_column("species", sa.Column("harvest_type", sa.String(length=80), nullable=True))
    op.create_table(
        "species_varieties",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "species_id",
            sa.Uuid(),
            sa.ForeignKey("species.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.UniqueConstraint("species_id", "name", name="uq_species_varieties_name"),
    )


def downgrade() -> None:
    op.drop_table("species_varieties")
    op.drop_column("species", "harvest_type")
    op.drop_column("species", "harvest_potential")
