"""Store species wood density and the carbon stock calculated for each measurement.

Revision ID: 0017_carbon_stock
Revises: 0016_carbon_monitoring
"""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0017_carbon_stock"
down_revision: str | None = "0016_carbon_monitoring"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Basic specific gravity is oven-dry mass divided by green volume.
# These are published species values, not a shared default.
PARAMETERS = (
    (
        "Grevillea robusta",
        0.51,
        "Chudnoff 1984, USDA Agriculture Handbook 607. Basic specific gravity.",
    ),
    (
        "Cupressus lusitanica",
        0.43,
        "Chudnoff 1984, USDA Agriculture Handbook 607. Basic specific gravity.",
    ),
    (
        "Mangifera indica",
        0.567,
        "Zanne et al. 2009, Global Wood Density Database, species-mean wood specific gravity.",
    ),
    (
        "Alnus acuminata",
        0.386,
        "Zanne et al. 2009, Global Wood Density Database, species-mean wood specific gravity.",
    ),
    (
        "Artocarpus heterophyllus",
        0.492,
        "Zanne et al. 2009, Global Wood Density Database, species-mean wood specific gravity.",
    ),
)


def upgrade() -> None:
    op.create_table(
        "species_carbon_parameters",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("scientific_name", sa.String(length=200), nullable=False),
        sa.Column("basic_specific_gravity", sa.Float(), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "basic_specific_gravity > 0 AND basic_specific_gravity <= 1.5",
            name="ck_species_carbon_parameters_gravity",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("scientific_name"),
    )
    table = sa.table(
        "species_carbon_parameters",
        sa.column("id", sa.Uuid()),
        sa.column("scientific_name", sa.String()),
        sa.column("basic_specific_gravity", sa.Float()),
        sa.column("source", sa.Text()),
    )
    op.bulk_insert(
        table,
        [
            {
                "id": uuid.uuid4(),
                "scientific_name": name,
                "basic_specific_gravity": gravity,
                "source": source,
            }
            for name, gravity, source in PARAMETERS
        ],
    )
    op.add_column(
        "carbon_measurements",
        sa.Column("review_status", sa.String(length=20), server_default="pending", nullable=False),
    )
    op.add_column("carbon_measurements", sa.Column("review_reason", sa.Text(), nullable=True))
    op.add_column("carbon_measurements", sa.Column("reviewed_by", sa.Uuid(), nullable=True))
    op.add_column(
        "carbon_measurements", sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("carbon_measurements", sa.Column("agb_kg", sa.Float(), nullable=True))
    op.add_column("carbon_measurements", sa.Column("carbon_kg", sa.Float(), nullable=True))
    op.add_column("carbon_measurements", sa.Column("co2e_kg", sa.Float(), nullable=True))
    op.add_column(
        "carbon_measurements", sa.Column("wood_specific_gravity", sa.Float(), nullable=True)
    )
    op.add_column(
        "carbon_measurements", sa.Column("methodology_id", sa.String(length=40), nullable=True)
    )
    op.add_column(
        "carbon_measurements", sa.Column("methodology_version", sa.String(length=20), nullable=True)
    )
    op.add_column("carbon_measurements", sa.Column("parameter_source", sa.Text(), nullable=True))
    op.add_column("carbon_measurements", sa.Column("estimate_note", sa.Text(), nullable=True))
    op.create_check_constraint(
        "ck_carbon_measurements_review",
        "carbon_measurements",
        "review_status IN ('pending', 'accepted', 'correction')",
    )
    op.create_foreign_key(
        "fk_carbon_measurements_reviewed_by",
        "carbon_measurements",
        "users",
        ["reviewed_by"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_carbon_measurements_reviewed_by", "carbon_measurements", type_="foreignkey"
    )
    op.drop_constraint("ck_carbon_measurements_review", "carbon_measurements", type_="check")
    for column in (
        "estimate_note",
        "parameter_source",
        "methodology_version",
        "methodology_id",
        "wood_specific_gravity",
        "co2e_kg",
        "carbon_kg",
        "agb_kg",
        "reviewed_at",
        "reviewed_by",
        "review_reason",
        "review_status",
    ):
        op.drop_column("carbon_measurements", column)
    op.drop_table("species_carbon_parameters")
