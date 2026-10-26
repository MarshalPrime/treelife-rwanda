"""Initial registration schema.

Coordinate reference system: WGS 84, SRID 4326.
Geography columns store POINT(longitude latitude).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geography

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

POINT = Geography(geometry_type="POINT", srid=4326, spatial_index=False)


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.create_table(
        "organizations",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("org_type", sa.String(40), nullable=False),
        sa.Column("external_id", sa.String(120)),
        sa.Column("notes", sa.Text()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "org_type IN ('cooperative', 'ngo', 'public_institution', 'private', "
            "'community_group', 'other')",
            name="ck_organizations_type",
        ),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("full_name", sa.String(200), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column(
            "organization_id", sa.Uuid(), sa.ForeignKey("organizations.id", ondelete="SET NULL")
        ),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("role IN ('admin', 'field_officer', 'viewer')", name="ck_users_role"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_table(
        "species",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("scientific_name", sa.String(200), nullable=False),
        sa.Column("common_name", sa.String(200), nullable=False),
        sa.Column("local_name", sa.String(200)),
        sa.Column("category", sa.String(40), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "category IN ('urban', 'fruit', 'agroforestry', 'other')",
            name="ck_species_category",
        ),
        sa.UniqueConstraint("scientific_name", name="uq_species_scientific_name"),
    )
    op.create_table(
        "planting_sites",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("public_code", sa.String(32), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("site_type", sa.String(40), nullable=False),
        sa.Column(
            "organization_id", sa.Uuid(), sa.ForeignKey("organizations.id", ondelete="SET NULL")
        ),
        sa.Column("province", sa.String(120)),
        sa.Column("district", sa.String(120)),
        sa.Column("sector", sa.String(120)),
        sa.Column("cell", sa.String(120)),
        sa.Column("village", sa.String(120)),
        sa.Column("latitude", sa.Float()),
        sa.Column("longitude", sa.Float()),
        sa.Column("location", POINT),
        sa.Column("area_hectares", sa.Float()),
        sa.Column("notes", sa.Text()),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("data_origin", sa.String(32), nullable=False),
        sa.Column("external_id", sa.String(120)),
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
            "site_type IN ('farm', 'urban_plot', 'roadside', 'institution', 'orchard', "
            "'nursery_holding', 'other')",
            name="ck_sites_type",
        ),
        sa.CheckConstraint("status IN ('active', 'inactive')", name="ck_sites_status"),
        sa.CheckConstraint(
            "data_origin IN ('field_entry', 'synthetic_demo', 'imported')",
            name="ck_sites_origin",
        ),
        sa.CheckConstraint(
            "latitude IS NULL OR (latitude >= -90 AND latitude <= 90)", name="ck_sites_latitude"
        ),
        sa.CheckConstraint(
            "longitude IS NULL OR (longitude >= -180 AND longitude <= 180)",
            name="ck_sites_longitude",
        ),
        sa.CheckConstraint(
            "(latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL)",
            name="ck_sites_coordinate_pair",
        ),
        sa.CheckConstraint(
            "area_hectares IS NULL OR (area_hectares >= 0 AND area_hectares <= 100000)",
            name="ck_sites_area",
        ),
        sa.UniqueConstraint("public_code", name="uq_sites_public_code"),
        sa.UniqueConstraint("client_request_id", name="uq_sites_client_request_id"),
    )
    op.create_table(
        "individual_trees",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("public_code", sa.String(32), nullable=False),
        sa.Column(
            "site_id",
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
        sa.Column("category", sa.String(40), nullable=False),
        sa.Column("planting_date", sa.Date(), nullable=False),
        sa.Column("latitude", sa.Float()),
        sa.Column("longitude", sa.Float()),
        sa.Column("location", POINT),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("notes", sa.Text()),
        sa.Column("data_origin", sa.String(32), nullable=False),
        sa.Column("external_id", sa.String(120)),
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
            "category IN ('urban', 'fruit', 'agroforestry', 'other')", name="ck_trees_category"
        ),
        sa.CheckConstraint(
            "status IN ('planted', 'surviving', 'stressed', 'dead', 'removed', 'unknown')",
            name="ck_trees_status",
        ),
        sa.CheckConstraint(
            "data_origin IN ('field_entry', 'synthetic_demo', 'imported')",
            name="ck_trees_origin",
        ),
        sa.CheckConstraint(
            "latitude IS NULL OR (latitude >= -90 AND latitude <= 90)", name="ck_trees_latitude"
        ),
        sa.CheckConstraint(
            "longitude IS NULL OR (longitude >= -180 AND longitude <= 180)",
            name="ck_trees_longitude",
        ),
        sa.CheckConstraint(
            "(latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL)",
            name="ck_trees_coordinate_pair",
        ),
        sa.UniqueConstraint("public_code", name="uq_trees_public_code"),
        sa.UniqueConstraint("client_request_id", name="uq_trees_client_request_id"),
    )
    op.create_table(
        "planting_batches",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("public_code", sa.String(32), nullable=False),
        sa.Column(
            "site_id",
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
        sa.Column("category", sa.String(40), nullable=False),
        sa.Column("planting_date", sa.Date(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("latitude", sa.Float()),
        sa.Column("longitude", sa.Float()),
        sa.Column("location", POINT),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("notes", sa.Text()),
        sa.Column("data_origin", sa.String(32), nullable=False),
        sa.Column("external_id", sa.String(120)),
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
            "category IN ('urban', 'fruit', 'agroforestry', 'other')", name="ck_batches_category"
        ),
        sa.CheckConstraint(
            "status IN ('planted', 'surviving', 'stressed', 'dead', 'removed', 'unknown')",
            name="ck_batches_status",
        ),
        sa.CheckConstraint(
            "data_origin IN ('field_entry', 'synthetic_demo', 'imported')",
            name="ck_batches_origin",
        ),
        sa.CheckConstraint("quantity >= 1 AND quantity <= 100000", name="ck_batches_quantity"),
        sa.CheckConstraint(
            "latitude IS NULL OR (latitude >= -90 AND latitude <= 90)", name="ck_batches_latitude"
        ),
        sa.CheckConstraint(
            "longitude IS NULL OR (longitude >= -180 AND longitude <= 180)",
            name="ck_batches_longitude",
        ),
        sa.CheckConstraint(
            "(latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL)",
            name="ck_batches_coordinate_pair",
        ),
        sa.UniqueConstraint("public_code", name="uq_batches_public_code"),
        sa.UniqueConstraint("client_request_id", name="uq_batches_client_request_id"),
    )
    op.create_table(
        "lifecycle_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("public_code", sa.String(32), nullable=False),
        sa.Column("tree_id", sa.Uuid(), sa.ForeignKey("individual_trees.id", ondelete="RESTRICT")),
        sa.Column("batch_id", sa.Uuid(), sa.ForeignKey("planting_batches.id", ondelete="RESTRICT")),
        sa.Column("site_id", sa.Uuid(), sa.ForeignKey("planting_sites.id", ondelete="RESTRICT")),
        sa.Column("event_type", sa.String(40), nullable=False),
        sa.Column("event_date", sa.Date(), nullable=False),
        sa.Column("status_after", sa.String(32)),
        sa.Column("survival_count", sa.Integer()),
        sa.Column("notes", sa.Text()),
        sa.Column("data_origin", sa.String(32), nullable=False),
        sa.Column("client_request_id", sa.String(80)),
        sa.Column(
            "recorded_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "event_type IN ('inspection', 'survival_check', 'maintenance', 'harvest_observation', 'other')",
            name="ck_events_type",
        ),
        sa.CheckConstraint(
            "data_origin IN ('field_entry', 'synthetic_demo', 'imported')",
            name="ck_events_origin",
        ),
        sa.CheckConstraint(
            "status_after IS NULL OR status_after IN "
            "('planted', 'surviving', 'stressed', 'dead', 'removed', 'unknown', 'active', 'inactive')",
            name="ck_events_status_after",
        ),
        sa.CheckConstraint(
            "survival_count IS NULL OR (survival_count >= 0 AND survival_count <= 100000)",
            name="ck_events_survival_count",
        ),
        sa.CheckConstraint(
            "(CASE WHEN tree_id IS NOT NULL THEN 1 ELSE 0 END) + "
            "(CASE WHEN batch_id IS NOT NULL THEN 1 ELSE 0 END) + "
            "(CASE WHEN site_id IS NOT NULL THEN 1 ELSE 0 END) = 1",
            name="ck_events_one_target",
        ),
        sa.UniqueConstraint("public_code", name="uq_events_public_code"),
        sa.UniqueConstraint("client_request_id", name="uq_events_client_request_id"),
    )
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("actor_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("entity_type", sa.String(40), nullable=False),
        sa.Column("entity_id", sa.String(64), nullable=False),
        sa.Column("changed_fields", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("action IN ('create', 'update')", name="ck_audit_action"),
    )
    op.create_index("ix_sites_district", "planting_sites", ["district"])
    op.create_index("ix_sites_status", "planting_sites", ["status"])
    op.create_index("ix_trees_site_id", "individual_trees", ["site_id"])
    op.create_index("ix_trees_species_id", "individual_trees", ["species_id"])
    op.create_index("ix_trees_status", "individual_trees", ["status"])
    op.create_index("ix_batches_site_id", "planting_batches", ["site_id"])
    op.create_index("ix_batches_species_id", "planting_batches", ["species_id"])
    op.create_index("ix_events_tree_id", "lifecycle_events", ["tree_id"])
    op.create_index("ix_events_batch_id", "lifecycle_events", ["batch_id"])
    op.create_index("ix_events_site_id", "lifecycle_events", ["site_id"])
    op.create_index("ix_audit_entity", "audit_logs", ["entity_type", "entity_id"])
    op.execute("CREATE INDEX ix_sites_location ON planting_sites USING GIST (location)")
    op.execute("CREATE INDEX ix_trees_location ON individual_trees USING GIST (location)")
    op.execute("CREATE INDEX ix_batches_location ON planting_batches USING GIST (location)")


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("lifecycle_events")
    op.drop_table("planting_batches")
    op.drop_table("individual_trees")
    op.drop_table("planting_sites")
    op.drop_table("species")
    op.drop_table("users")
    op.drop_table("organizations")
