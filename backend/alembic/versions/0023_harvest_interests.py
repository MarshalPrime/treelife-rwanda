"""Store buyer interest in an expected harvest.

Revision ID: 0023_harvest_interests
Revises: 0022_species_yield
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0023_harvest_interests"
down_revision: str | None = "0022_species_yield"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "harvest_interests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("public_code", sa.String(length=32), nullable=False),
        sa.Column("requester_id", sa.Uuid(), nullable=False),
        sa.Column("farmer_id", sa.Uuid(), nullable=False),
        sa.Column("species_id", sa.Uuid(), nullable=False),
        sa.Column("province", sa.String(length=120), nullable=True),
        sa.Column("district", sa.String(length=120), nullable=True),
        sa.Column("sector", sa.String(length=120), nullable=True),
        sa.Column("farm_label", sa.String(length=200), nullable=True),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(length=16), nullable=False),
        sa.Column("period", sa.String(length=120), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("response_note", sa.Text(), nullable=True),
        sa.Column("responded_by", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'accepted', 'rejected', 'completed', 'cancelled')",
            name="ck_harvest_interests_status",
        ),
        sa.CheckConstraint("unit IN ('kg', 'count')", name="ck_harvest_interests_unit"),
        sa.CheckConstraint(
            "quantity > 0 AND quantity <= 1000000",
            name="ck_harvest_interests_quantity",
        ),
        sa.ForeignKeyConstraint(["farmer_id"], ["farmers.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["requester_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["responded_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["species_id"], ["species.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("public_code"),
    )


def downgrade() -> None:
    op.drop_table("harvest_interests")
