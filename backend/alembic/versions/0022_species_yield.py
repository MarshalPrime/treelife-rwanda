"""Store published per-tree yield references used by the harvest forecast.

Revision ID: 0022_species_yield
Revises: 0021_tree_care_types
"""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0022_species_yield"
down_revision: str | None = "0021_tree_care_types"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# These are published figures for a productive tree, not a Rwanda field result.
# A species with no row here is left unestimated.
REFERENCES = (
    (
        "Mangifera indica",
        4,
        10,
        400,
        600,
        "count",
        "FAO Ecocrop, Mangifera indica: seedlings may take 3-7 years before first bearing, "
        "and in the 10th year a tree bears 400-600 fruits. Bally 2006, Species Profiles for "
        "Pacific Island Agroforestry: fruiting commonly begins 2-4 years after field planting.",
    ),
    (
        "Carica papaya",
        1,
        1,
        34,
        34,
        "kg",
        "Morton 1987, Fruits of warm climates: healthy, well cared for plants may average "
        "34 kg of fruit per plant per year. The figure is applied once a plant is a year old.",
    ),
)


def upgrade() -> None:
    op.create_table(
        "species_yield_references",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("scientific_name", sa.String(length=200), nullable=False),
        sa.Column("years_to_bearing", sa.Integer(), nullable=False),
        sa.Column("years_to_cited_yield", sa.Integer(), nullable=False),
        sa.Column("quantity_low", sa.Float(), nullable=False),
        sa.Column("quantity_high", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(length=16), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "years_to_bearing >= 1 AND years_to_cited_yield >= years_to_bearing",
            name="ck_species_yield_years",
        ),
        sa.CheckConstraint(
            "quantity_low > 0 AND quantity_high >= quantity_low AND quantity_high <= 1000000",
            name="ck_species_yield_quantity",
        ),
        sa.CheckConstraint("unit IN ('kg', 'count')", name="ck_species_yield_unit"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("scientific_name"),
    )
    table = sa.table(
        "species_yield_references",
        sa.column("id", sa.Uuid()),
        sa.column("scientific_name", sa.String()),
        sa.column("years_to_bearing", sa.Integer()),
        sa.column("years_to_cited_yield", sa.Integer()),
        sa.column("quantity_low", sa.Float()),
        sa.column("quantity_high", sa.Float()),
        sa.column("unit", sa.String()),
        sa.column("source", sa.Text()),
    )
    op.bulk_insert(
        table,
        [
            {
                "id": uuid.uuid4(),
                "scientific_name": name,
                "years_to_bearing": bearing,
                "years_to_cited_yield": cited,
                "quantity_low": low,
                "quantity_high": high,
                "unit": unit,
                "source": source,
            }
            for name, bearing, cited, low, high, unit, source in REFERENCES
        ],
    )


def downgrade() -> None:
    op.drop_table("species_yield_references")
