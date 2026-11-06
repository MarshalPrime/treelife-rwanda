"""Store a farmer's address from province down to the household.

Revision ID: 0007_farmer_place
Revises: 0006_tree_place
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007_farmer_place"
down_revision: str | None = "0006_tree_place"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_COLUMNS = ("province", "sector", "cell", "village", "isibo", "household")


def upgrade() -> None:
    for name in _COLUMNS:
        op.add_column("farmers", sa.Column(name, sa.String(length=120), nullable=True))


def downgrade() -> None:
    for name in reversed(_COLUMNS):
        op.drop_column("farmers", name)
