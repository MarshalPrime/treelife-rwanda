"""Record isibo and household on a planting site.

Revision ID: 0005_site_address
Revises: 0004_planting_farmer
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_site_address"
down_revision: str | None = "0004_planting_farmer"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("planting_sites", sa.Column("isibo", sa.String(length=120), nullable=True))
    op.add_column("planting_sites", sa.Column("household", sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column("planting_sites", "household")
    op.drop_column("planting_sites", "isibo")
