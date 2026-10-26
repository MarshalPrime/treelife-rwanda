"""Let a smallholder farmer sign in and record trees.

Revision ID: 0003_farmer_login
Revises: 0002_value_chain
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_farmer_login"
down_revision: str | None = "0002_value_chain"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("ck_users_role", "users", type_="check")
    op.create_check_constraint(
        "ck_users_role",
        "users",
        "role IN ('admin', 'field_officer', 'farmer', 'viewer')",
    )
    op.add_column(
        "farmers",
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
        ),
    )
    op.create_index("ix_farmers_user", "farmers", ["user_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_farmers_user", table_name="farmers")
    op.drop_column("farmers", "user_id")
    op.drop_constraint("ck_users_role", "users", type_="check")
    op.create_check_constraint(
        "ck_users_role",
        "users",
        "role IN ('admin', 'field_officer', 'viewer')",
    )
