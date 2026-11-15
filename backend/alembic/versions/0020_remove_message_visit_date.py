"""Remove the visit-specific field from general messages."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0020_remove_message_visit_date"
down_revision: str | None = "0019_message_districts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("messages", "visit_date")


def downgrade() -> None:
    op.add_column("messages", sa.Column("visit_date", sa.Date(), nullable=True))
