"""Nursery, distribution, growth, maintenance, harvest, sales, and advice.

Farmers are household or producer names. No national identifier is stored.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_value_chain"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    ]


def upgrade() -> None:
    op.create_table(
        "farmers",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("public_code", sa.String(32), nullable=False),
        sa.Column("display_name", sa.String(200), nullable=False),
        sa.Column(
            "organization_id", sa.Uuid(), sa.ForeignKey("organizations.id", ondelete="SET NULL")
        ),
        sa.Column("district", sa.String(120)),
        sa.Column("phone", sa.String(30)),
        sa.Column("notes", sa.Text()),
        sa.Column("data_origin", sa.String(32), nullable=False),
        sa.Column("client_request_id", sa.String(80)),
        sa.Column(
            "registered_by",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("registered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "data_origin IN ('field_entry', 'synthetic_demo', 'imported')",
            name="ck_farmers_origin",
        ),
        sa.UniqueConstraint("public_code", name="uq_farmers_public_code"),
        sa.UniqueConstraint("client_request_id", name="uq_farmers_request"),
    )
    op.add_column(
        "planting_sites",
        sa.Column("farmer_id", sa.Uuid(), sa.ForeignKey("farmers.id", ondelete="SET NULL")),
    )
    op.create_index("ix_sites_farmer", "planting_sites", ["farmer_id"])
    op.create_table(
        "seedling_lots",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("public_code", sa.String(32), nullable=False),
        sa.Column(
            "nursery_site_id",
            sa.Uuid(),
            sa.ForeignKey("planting_sites.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "species_id",
            sa.Uuid(),
            sa.ForeignKey("species.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("quantity_produced", sa.Integer(), nullable=False),
        sa.Column("quantity_remaining", sa.Integer(), nullable=False),
        sa.Column("produced_on", sa.Date(), nullable=False),
        sa.Column("notes", sa.Text()),
        sa.Column("data_origin", sa.String(32), nullable=False),
        sa.Column("client_request_id", sa.String(80)),
        sa.Column(
            "registered_by",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        *_timestamps(),
        sa.CheckConstraint(
            "quantity_produced >= 1 AND quantity_produced <= 100000", name="ck_lots_produced"
        ),
        sa.CheckConstraint(
            "quantity_remaining >= 0 AND quantity_remaining <= quantity_produced",
            name="ck_lots_remaining",
        ),
        sa.UniqueConstraint("public_code", name="uq_lots_public_code"),
        sa.UniqueConstraint("client_request_id", name="uq_lots_request"),
    )
    op.create_table(
        "distributions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("public_code", sa.String(32), nullable=False),
        sa.Column(
            "seedling_lot_id",
            sa.Uuid(),
            sa.ForeignKey("seedling_lots.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "destination_site_id",
            sa.Uuid(),
            sa.ForeignKey("planting_sites.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("farmer_id", sa.Uuid(), sa.ForeignKey("farmers.id", ondelete="SET NULL")),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("distributed_on", sa.Date(), nullable=False),
        sa.Column("notes", sa.Text()),
        sa.Column("data_origin", sa.String(32), nullable=False),
        sa.Column("client_request_id", sa.String(80)),
        sa.Column(
            "registered_by",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        *_timestamps(),
        sa.CheckConstraint(
            "quantity >= 1 AND quantity <= 100000", name="ck_distributions_quantity"
        ),
        sa.UniqueConstraint("public_code", name="uq_distributions_public_code"),
        sa.UniqueConstraint("client_request_id", name="uq_distributions_request"),
    )
    op.create_table(
        "growth_measurements",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("public_code", sa.String(32), nullable=False),
        sa.Column("tree_id", sa.Uuid(), sa.ForeignKey("individual_trees.id", ondelete="RESTRICT")),
        sa.Column("batch_id", sa.Uuid(), sa.ForeignKey("planting_batches.id", ondelete="RESTRICT")),
        sa.Column("measured_on", sa.Date(), nullable=False),
        sa.Column("height_m", sa.Float()),
        sa.Column("dbh_cm", sa.Float()),
        sa.Column("survival_count", sa.Integer()),
        sa.Column("notes", sa.Text()),
        sa.Column("data_origin", sa.String(32), nullable=False),
        sa.Column("client_request_id", sa.String(80)),
        sa.Column(
            "registered_by",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        *_timestamps(),
        sa.CheckConstraint(
            "(tree_id IS NOT NULL AND batch_id IS NULL) OR (tree_id IS NULL AND batch_id IS NOT NULL)",
            name="ck_growth_one_target",
        ),
        sa.CheckConstraint(
            "height_m IS NOT NULL OR dbh_cm IS NOT NULL OR survival_count IS NOT NULL",
            name="ck_growth_measure",
        ),
        sa.UniqueConstraint("public_code", name="uq_growth_public_code"),
        sa.UniqueConstraint("client_request_id", name="uq_growth_request"),
    )
    op.create_table(
        "maintenance_activities",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("public_code", sa.String(32), nullable=False),
        sa.Column("tree_id", sa.Uuid(), sa.ForeignKey("individual_trees.id", ondelete="RESTRICT")),
        sa.Column("batch_id", sa.Uuid(), sa.ForeignKey("planting_batches.id", ondelete="RESTRICT")),
        sa.Column("site_id", sa.Uuid(), sa.ForeignKey("planting_sites.id", ondelete="RESTRICT")),
        sa.Column("activity_type", sa.String(40), nullable=False),
        sa.Column("performed_on", sa.Date(), nullable=False),
        sa.Column("notes", sa.Text()),
        sa.Column("data_origin", sa.String(32), nullable=False),
        sa.Column("client_request_id", sa.String(80)),
        sa.Column(
            "registered_by",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        *_timestamps(),
        sa.CheckConstraint(
            "activity_type IN ('pruning', 'watering', 'mulching', 'pest_control', 'staking', 'other')",
            name="ck_maintenance_type",
        ),
        sa.CheckConstraint(
            "(CASE WHEN tree_id IS NULL THEN 0 ELSE 1 END + "
            "CASE WHEN batch_id IS NULL THEN 0 ELSE 1 END + "
            "CASE WHEN site_id IS NULL THEN 0 ELSE 1 END) = 1",
            name="ck_maintenance_one_target",
        ),
        sa.UniqueConstraint("public_code", name="uq_maintenance_public_code"),
        sa.UniqueConstraint("client_request_id", name="uq_maintenance_request"),
    )
    op.create_table(
        "harvests",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("public_code", sa.String(32), nullable=False),
        sa.Column("tree_id", sa.Uuid(), sa.ForeignKey("individual_trees.id", ondelete="RESTRICT")),
        sa.Column("batch_id", sa.Uuid(), sa.ForeignKey("planting_batches.id", ondelete="RESTRICT")),
        sa.Column("harvested_on", sa.Date(), nullable=False),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("quantity_remaining", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(16), nullable=False),
        sa.Column("notes", sa.Text()),
        sa.Column("data_origin", sa.String(32), nullable=False),
        sa.Column("client_request_id", sa.String(80)),
        sa.Column(
            "registered_by",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        *_timestamps(),
        sa.CheckConstraint("unit IN ('kg', 'count')", name="ck_harvests_unit"),
        sa.CheckConstraint("quantity > 0 AND quantity <= 1000000", name="ck_harvests_quantity"),
        sa.CheckConstraint(
            "quantity_remaining >= 0 AND quantity_remaining <= quantity + 0.0001",
            name="ck_harvests_remaining",
        ),
        sa.CheckConstraint(
            "(tree_id IS NOT NULL AND batch_id IS NULL) OR (tree_id IS NULL AND batch_id IS NOT NULL)",
            name="ck_harvests_one_target",
        ),
        sa.UniqueConstraint("public_code", name="uq_harvests_public_code"),
        sa.UniqueConstraint("client_request_id", name="uq_harvests_request"),
    )
    op.create_table(
        "sales",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("public_code", sa.String(32), nullable=False),
        sa.Column(
            "harvest_id",
            sa.Uuid(),
            sa.ForeignKey("harvests.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("sold_on", sa.Date(), nullable=False),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(16), nullable=False),
        sa.Column("amount_rwf", sa.Float(), nullable=False),
        sa.Column("buyer_name", sa.String(200), nullable=False),
        sa.Column("notes", sa.Text()),
        sa.Column("data_origin", sa.String(32), nullable=False),
        sa.Column("client_request_id", sa.String(80)),
        sa.Column(
            "registered_by",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        *_timestamps(),
        sa.CheckConstraint("quantity > 0 AND quantity <= 1000000", name="ck_sales_quantity"),
        sa.CheckConstraint(
            "amount_rwf >= 0 AND amount_rwf <= 100000000000", name="ck_sales_amount"
        ),
        sa.UniqueConstraint("public_code", name="uq_sales_public_code"),
        sa.UniqueConstraint("client_request_id", name="uq_sales_request"),
    )
    op.create_table(
        "advisories",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("public_code", sa.String(32), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("species_id", sa.Uuid(), sa.ForeignKey("species.id", ondelete="SET NULL")),
        sa.Column("farmer_id", sa.Uuid(), sa.ForeignKey("farmers.id", ondelete="SET NULL")),
        sa.Column("site_id", sa.Uuid(), sa.ForeignKey("planting_sites.id", ondelete="SET NULL")),
        sa.Column("issued_on", sa.Date(), nullable=False),
        sa.Column("data_origin", sa.String(32), nullable=False),
        sa.Column("client_request_id", sa.String(80)),
        sa.Column(
            "registered_by",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        *_timestamps(),
        sa.UniqueConstraint("public_code", name="uq_advisories_public_code"),
        sa.UniqueConstraint("client_request_id", name="uq_advisories_request"),
    )


def downgrade() -> None:
    op.drop_table("advisories")
    op.drop_table("sales")
    op.drop_table("harvests")
    op.drop_table("maintenance_activities")
    op.drop_table("growth_measurements")
    op.drop_table("distributions")
    op.drop_table("seedling_lots")
    op.drop_index("ix_sites_farmer", table_name="planting_sites")
    op.drop_column("planting_sites", "farmer_id")
    op.drop_table("farmers")
