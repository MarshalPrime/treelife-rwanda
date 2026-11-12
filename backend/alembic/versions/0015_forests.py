"""Register a forest stand as one boundary instead of one tree at a time.

Revision ID: 0015_forests
Revises: 0014_harvest_feedback
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geography
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0015_forests"
down_revision: str | None = "0014_harvest_feedback"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

POLYGON = Geography(geometry_type="POLYGON", srid=4326, spatial_index=False)


def upgrade() -> None:
    op.create_table(
        "forests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("public_code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("species_id", sa.Uuid(), nullable=False),
        sa.Column("estimated_trees", sa.Integer(), nullable=False),
        sa.Column("distribution", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("province", sa.String(length=120), nullable=True),
        sa.Column("district", sa.String(length=120), nullable=True),
        sa.Column("area_hectares", sa.Float(), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("ring", JSONB(), nullable=False),
        sa.Column("boundary", POLYGON, nullable=False),
        sa.Column("data_origin", sa.String(length=32), nullable=False),
        sa.Column("client_request_id", sa.String(length=80), nullable=True),
        sa.Column("registered_by", sa.Uuid(), nullable=False),
        sa.Column("registered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "distribution IN ('natural', 'rows', 'clusters', 'mixed')",
            name="ck_forests_distribution",
        ),
        sa.CheckConstraint(
            "status IN ('surviving', 'stressed', 'dead', 'unknown')",
            name="ck_forests_status",
        ),
        sa.CheckConstraint(
            "data_origin IN ('field_entry', 'synthetic_demo', 'imported')",
            name="ck_forests_origin",
        ),
        sa.CheckConstraint(
            "estimated_trees >= 1 AND estimated_trees <= 10000000",
            name="ck_forests_trees",
        ),
        sa.CheckConstraint("area_hectares > 0", name="ck_forests_area"),
        sa.CheckConstraint(
            "latitude IS NULL OR (latitude >= -90 AND latitude <= 90)",
            name="ck_forests_latitude",
        ),
        sa.CheckConstraint(
            "longitude IS NULL OR (longitude >= -180 AND longitude <= 180)",
            name="ck_forests_longitude",
        ),
        sa.ForeignKeyConstraint(["species_id"], ["species.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["registered_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("public_code"),
        sa.UniqueConstraint("client_request_id"),
    )


def downgrade() -> None:
    op.drop_table("forests")
