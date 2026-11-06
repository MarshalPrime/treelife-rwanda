"""Record a tree or batch address from district down to the household.

Revision ID: 0006_tree_place
Revises: 0005_site_address
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_tree_place"
down_revision: str | None = "0005_site_address"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_COLUMNS = ("province", "district", "sector", "cell", "village", "isibo", "household")


def upgrade() -> None:
    for table in ("individual_trees", "planting_batches"):
        for name in _COLUMNS:
            op.add_column(table, sa.Column(name, sa.String(length=120), nullable=True))


def downgrade() -> None:
    for table in ("planting_batches", "individual_trees"):
        for name in reversed(_COLUMNS):
            op.drop_column(table, name)
