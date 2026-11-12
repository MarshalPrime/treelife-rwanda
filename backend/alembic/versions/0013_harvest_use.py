"""Record whether harvested produce was sold, eaten, or given away.

Revision ID: 0013_harvest_use
Revises: 0012_profile_photo
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013_harvest_use"
down_revision: str | None = "0012_profile_photo"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "sales",
        sa.Column("purpose", sa.String(length=32), nullable=False, server_default="sold"),
    )
    op.create_check_constraint(
        "ck_sales_purpose",
        "sales",
        "purpose IN ('sold', 'personal_consumption', 'given_away', 'other')",
    )
    op.alter_column("sales", "buyer_name", existing_type=sa.String(length=200), nullable=True)


def downgrade() -> None:
    op.execute("UPDATE sales SET buyer_name = 'Unknown' WHERE buyer_name IS NULL")
    op.alter_column("sales", "buyer_name", existing_type=sa.String(length=200), nullable=False)
    op.drop_constraint("ck_sales_purpose", "sales", type_="check")
    op.drop_column("sales", "purpose")
