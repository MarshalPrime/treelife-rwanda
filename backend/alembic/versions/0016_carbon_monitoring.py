"""Store carbon monitoring authorization and field measurements.

Revision ID: 0016_carbon_monitoring
Revises: 0015_forests
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0016_carbon_monitoring"
down_revision: str | None = "0015_forests"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "carbon_authorizations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("experience", sa.Text(), nullable=False),
        sa.Column("training", sa.Text(), nullable=False),
        sa.Column("qualifications", sa.Text(), nullable=False),
        sa.Column("decision_reason", sa.Text(), nullable=True),
        sa.Column("decided_by", sa.Uuid(), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'revoked')",
            name="ck_carbon_authorizations_status",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["decided_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_carbon_authorizations_user_id", "carbon_authorizations", ["user_id"])
    op.create_index(
        "uq_carbon_auth_open",
        "carbon_authorizations",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('pending', 'approved')"),
    )
    op.create_table(
        "carbon_authorization_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("authorization_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("action", sa.String(length=20), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("actor_id", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "action IN ('submitted', 'approved', 'rejected', 'revoked')",
            name="ck_carbon_authorization_events_action",
        ),
        sa.ForeignKeyConstraint(
            ["authorization_id"], ["carbon_authorizations.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "carbon_documents",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("authorization_id", sa.Uuid(), nullable=False),
        sa.Column("original_name", sa.String(length=200), nullable=False),
        sa.Column("stored_ext", sa.String(length=8), nullable=False),
        sa.Column(
            "uploaded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["authorization_id"], ["carbon_authorizations.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "carbon_measurements",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("public_code", sa.String(length=32), nullable=False),
        sa.Column("tree_id", sa.Uuid(), nullable=True),
        sa.Column("species_id", sa.Uuid(), nullable=False),
        sa.Column("species_verified", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("species_note", sa.Text(), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("dbh_cm", sa.Float(), nullable=False),
        sa.Column("height_m", sa.Float(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("measured_on", sa.Date(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("photo_ext", sa.String(length=8), nullable=True),
        sa.Column("photo_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("collected_by", sa.Uuid(), nullable=False),
        sa.Column("client_request_id", sa.String(length=80), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "status IN ('surviving', 'stressed', 'dead', 'planted', 'unknown')",
            name="ck_carbon_measurements_status",
        ),
        sa.CheckConstraint("dbh_cm > 0", name="ck_carbon_measurements_dbh"),
        sa.ForeignKeyConstraint(["tree_id"], ["individual_trees.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["species_id"], ["species.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["collected_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("public_code"),
        sa.UniqueConstraint("client_request_id"),
    )
    op.create_index("ix_carbon_measurements_collected_by", "carbon_measurements", ["collected_by"])
    op.create_table(
        "carbon_measurement_revisions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("measurement_id", sa.Uuid(), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=True),
        sa.Column("snapshot", JSONB(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["measurement_id"], ["carbon_measurements.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("carbon_measurement_revisions")
    op.drop_index("ix_carbon_measurements_collected_by", table_name="carbon_measurements")
    op.drop_table("carbon_measurements")
    op.drop_table("carbon_documents")
    op.drop_table("carbon_authorization_events")
    op.drop_index("uq_carbon_auth_open", table_name="carbon_authorizations")
    op.drop_index("ix_carbon_authorizations_user_id", table_name="carbon_authorizations")
    op.drop_table("carbon_authorizations")
