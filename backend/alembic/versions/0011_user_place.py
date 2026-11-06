"""Store where a signed-in person lives, including a field officer.

Revision ID: 0011_user_place
Revises: 0010_species_catalogue
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011_user_place"
down_revision: str | None = "0010_species_catalogue"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_COLUMNS = (
    ("province", 120),
    ("district", 120),
    ("sector", 120),
    ("cell", 120),
    ("village", 120),
    ("isibo", 120),
    ("household", 120),
    ("phone", 30),
)


def upgrade() -> None:
    for name, length in _COLUMNS:
        op.add_column("users", sa.Column(name, sa.String(length=length), nullable=True))


def downgrade() -> None:
    for name, _length in reversed(_COLUMNS):
        op.drop_column("users", name)
