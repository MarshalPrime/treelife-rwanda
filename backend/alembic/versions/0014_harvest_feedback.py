"""Track stored produce, harvest feedback, and attention notices.

Revision ID: 0014_harvest_feedback
Revises: 0013_harvest_use
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014_harvest_feedback"
down_revision: str | None = "0013_harvest_use"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("ck_sales_purpose", "sales", type_="check")
    op.create_check_constraint(
        "ck_sales_purpose",
        "sales",
        "purpose IN ('sold', 'personal_consumption', 'stored', 'given_away', 'other')",
    )
    op.create_table(
        "harvest_feedback",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("public_code", sa.String(length=32), nullable=False),
        sa.Column("harvest_id", sa.Uuid(), nullable=True),
        sa.Column("tree_id", sa.Uuid(), nullable=True),
        sa.Column("batch_id", sa.Uuid(), nullable=True),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("loss_quantity", sa.Float(), nullable=True),
        sa.Column("loss_unit", sa.String(length=16), nullable=True),
        sa.Column("verified_quantity", sa.Float(), nullable=True),
        sa.Column("data_origin", sa.String(length=32), nullable=False),
        sa.Column("client_request_id", sa.String(length=80), nullable=True),
        sa.Column("registered_by", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "kind IN ('experience', 'challenge', 'loss', 'suggestion', "
            "'observation', 'verification', 'recommendation')",
            name="ck_harvest_feedback_kind",
        ),
        sa.CheckConstraint(
            "loss_quantity IS NULL OR (loss_quantity > 0 AND loss_quantity <= 1000000)",
            name="ck_harvest_feedback_loss",
        ),
        sa.CheckConstraint(
            "verified_quantity IS NULL OR (verified_quantity >= 0 AND verified_quantity <= 1000000)",
            name="ck_harvest_feedback_verified",
        ),
        sa.ForeignKeyConstraint(["batch_id"], ["planting_batches.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["harvest_id"], ["harvests.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["registered_by"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["tree_id"], ["individual_trees.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("client_request_id"),
        sa.UniqueConstraint("public_code"),
    )
    op.create_table(
        "harvest_notices",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("public_code", sa.String(length=32), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("summary", sa.String(length=400), nullable=False),
        sa.Column("harvest_id", sa.Uuid(), nullable=True),
        sa.Column("registered_by", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "kind IN ('loss', 'unusual', 'mismatch')", name="ck_harvest_notices_kind"
        ),
        sa.ForeignKeyConstraint(["harvest_id"], ["harvests.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["registered_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("public_code"),
    )


def downgrade() -> None:
    op.drop_table("harvest_notices")
    op.drop_table("harvest_feedback")
    op.drop_constraint("ck_sales_purpose", "sales", type_="check")
    op.create_check_constraint(
        "ck_sales_purpose",
        "sales",
        "purpose IN ('sold', 'personal_consumption', 'given_away', 'other')",
    )
