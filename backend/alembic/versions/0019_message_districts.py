"""Store district filters used for farmer messages."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0019_message_districts"
down_revision: str | None = "0018_messages"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("messages", sa.Column("target_districts", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("messages", "target_districts")
