"""Name the household on a tree or batch, for an officer helping a farmer.

Revision ID: 0004_planting_farmer
Revises: 0003_farmer_login
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_planting_farmer"
down_revision: str | None = "0003_farmer_login"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    for table, index in (
        ("individual_trees", "ix_trees_farmer"),
        ("planting_batches", "ix_batches_farmer"),
    ):
        op.add_column(
            table,
            sa.Column(
                "farmer_id",
                sa.Uuid(),
                sa.ForeignKey("farmers.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
        op.create_index(index, table, ["farmer_id"])


def downgrade() -> None:
    op.drop_index("ix_batches_farmer", table_name="planting_batches")
    op.drop_column("planting_batches", "farmer_id")
    op.drop_index("ix_trees_farmer", table_name="individual_trees")
    op.drop_column("individual_trees", "farmer_id")
