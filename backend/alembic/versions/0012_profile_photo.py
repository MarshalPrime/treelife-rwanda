"""Remember when a farmer or field officer saved a profile photo.

Revision ID: 0012_profile_photo
Revises: 0011_user_place
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012_profile_photo"
down_revision: str | None = "0011_user_place"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("profile_photo_ext", sa.String(length=8), nullable=True))
    op.add_column("users", sa.Column("profile_photo_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "profile_photo_at")
    op.drop_column("users", "profile_photo_ext")
