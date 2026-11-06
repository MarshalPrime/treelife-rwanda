"""Store planting details on an individual tree.

A tree registered from the field can be located by coordinates without a
planting site. Planting method and the optional site conditions stay on the
tree. Existing trees keep their site.

Revision ID: 0009_planting_details
Revises: 0008_species_profile
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009_planting_details"
down_revision: str | None = "0008_species_profile"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("individual_trees", "site_id", existing_type=sa.Uuid(), nullable=True)
    op.add_column(
        "individual_trees",
        sa.Column(
            "planting_date_approximate",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column("individual_trees", sa.Column("planting_method", sa.String(40), nullable=True))
    op.add_column(
        "individual_trees", sa.Column("planting_method_note", sa.String(200), nullable=True)
    )
    op.add_column("individual_trees", sa.Column("soil_type", sa.String(40), nullable=True))
    op.add_column("individual_trees", sa.Column("terrain", sa.String(40), nullable=True))
    op.add_column("individual_trees", sa.Column("water_availability", sa.String(40), nullable=True))
    op.add_column("individual_trees", sa.Column("spacing", sa.String(40), nullable=True))
    op.add_column("individual_trees", sa.Column("fertilizer_applied", sa.String(20), nullable=True))
    op.add_column("individual_trees", sa.Column("mulching_applied", sa.String(20), nullable=True))
    op.add_column("individual_trees", sa.Column("watering_provided", sa.String(20), nullable=True))
    op.create_check_constraint(
        "ck_trees_planting_method",
        "individual_trees",
        "planting_method IS NULL OR planting_method IN "
        "('ground', 'transplant', 'direct_seeding', 'natural', 'other')",
    )
    op.create_check_constraint(
        "ck_trees_soil",
        "individual_trees",
        "soil_type IS NULL OR soil_type IN ('clay', 'sandy', 'loam', 'rocky', 'other', 'unknown')",
    )
    op.create_check_constraint(
        "ck_trees_terrain",
        "individual_trees",
        "terrain IS NULL OR terrain IN ('flat', 'gentle', 'steep', 'other', 'unknown')",
    )
    op.create_check_constraint(
        "ck_trees_water",
        "individual_trees",
        "water_availability IS NULL OR water_availability IN "
        "('rainfed', 'nearby', 'irrigation', 'limited', 'unknown')",
    )
    op.create_check_constraint(
        "ck_trees_fertilizer",
        "individual_trees",
        "fertilizer_applied IS NULL OR fertilizer_applied IN ('yes', 'no', 'unknown')",
    )
    op.create_check_constraint(
        "ck_trees_mulching",
        "individual_trees",
        "mulching_applied IS NULL OR mulching_applied IN ('yes', 'no', 'unknown')",
    )
    op.create_check_constraint(
        "ck_trees_watering",
        "individual_trees",
        "watering_provided IS NULL OR watering_provided IN ('yes', 'no', 'unknown')",
    )


def downgrade() -> None:
    for name in (
        "ck_trees_watering",
        "ck_trees_mulching",
        "ck_trees_fertilizer",
        "ck_trees_water",
        "ck_trees_terrain",
        "ck_trees_soil",
        "ck_trees_planting_method",
    ):
        op.drop_constraint(name, "individual_trees", type_="check")
    for name in (
        "watering_provided",
        "mulching_applied",
        "fertilizer_applied",
        "spacing",
        "water_availability",
        "terrain",
        "soil_type",
        "planting_method_note",
        "planting_method",
        "planting_date_approximate",
    ):
        op.drop_column("individual_trees", name)
    op.alter_column("individual_trees", "site_id", existing_type=sa.Uuid(), nullable=False)
