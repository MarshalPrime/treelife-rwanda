"""Add in-app messages and per-user notification state."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0018_messages"
down_revision: str | None = "0017_carbon_stock"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("sender_id", sa.Uuid(), nullable=False),
        sa.Column("channel", sa.String(length=16), nullable=False, server_default="in_app"),
        sa.Column("audience", sa.String(length=32), nullable=False),
        sa.Column("target_user_id", sa.Uuid(), nullable=True),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("visit_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "audience IN ('field_officer', 'farmer', 'individual')",
            name="ck_messages_audience",
        ),
        sa.CheckConstraint("channel IN ('in_app', 'sms')", name="ck_messages_channel"),
        sa.ForeignKeyConstraint(["sender_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["target_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_messages_sender_id", "messages", ["sender_id"])
    op.create_index("ix_messages_target_user_id", "messages", ["target_user_id"])
    op.create_table(
        "message_recipients",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("message_id", sa.Uuid(), nullable=False),
        sa.Column("recipient_id", sa.Uuid(), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["message_id"], ["messages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["recipient_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("message_id", "recipient_id", name="uq_message_recipients_message_user"),
    )
    op.create_index("ix_message_recipients_message_id", "message_recipients", ["message_id"])
    op.create_index("ix_message_recipients_recipient_id", "message_recipients", ["recipient_id"])


def downgrade() -> None:
    op.drop_index("ix_message_recipients_recipient_id", table_name="message_recipients")
    op.drop_index("ix_message_recipients_message_id", table_name="message_recipients")
    op.drop_table("message_recipients")
    op.drop_index("ix_messages_target_user_id", table_name="messages")
    op.drop_index("ix_messages_sender_id", table_name="messages")
    op.drop_table("messages")
