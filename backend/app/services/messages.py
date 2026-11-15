"""Create messages and manage per-user in-app notifications."""

from __future__ import annotations

import uuid

from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session, joinedload

from app.domain.errors import DomainError
from app.models.entities import Farmer, Message, MessageRecipient, User, UserRole
from app.schemas.messages import MessageAudience, MessageCreate
from app.services.common import utcnow, write_audit

RECIPIENT_ROLES = {UserRole.field_officer.value, UserRole.farmer.value}


def create_message(db: Session, sender: User, payload: MessageCreate) -> Message:
    if payload.channel.value == "sms":
        raise DomainError(
            "SMS delivery is not available yet. Choose in-app notification.",
            field="channel",
        )

    target_users: list[User]
    if payload.audience == MessageAudience.individual:
        target_users = list(
            db.scalars(
                select(User).where(User.id.in_(payload.recipient_user_ids), User.is_active.is_(True))
            ).all()
        )
        if len(target_users) != len(set(payload.recipient_user_ids)):
            raise DomainError("One or more selected recipients are not active.", field="recipient_user_ids")
        if any(user.role not in RECIPIENT_ROLES for user in target_users):
            raise DomainError(
                "Select a field officer or farmer.", field="recipient_user_ids"
            )
        recipients = target_users
    else:
        target_users = []
        filters = [User.role == payload.audience.value, User.is_active.is_(True)]
        if payload.audience == MessageAudience.farmer and payload.districts:
            recipients_query = select(User).join(Farmer, Farmer.user_id == User.id)
            filters.append(Farmer.district.in_(payload.districts))
        else:
            recipients_query = select(User)
        recipients = list(db.scalars(recipients_query.where(*filters).order_by(User.full_name, User.id)).all())
        if not recipients:
            raise DomainError("There are no active recipients in this group.", field="audience")

    message = Message(
        sender_id=sender.id,
        channel=payload.channel.value,
        audience=payload.audience.value,
        target_districts=payload.districts or None,
        target_user_id=target_users[0].id if len(target_users) == 1 else None,
        title=payload.title,
        body=payload.body,
    )
    db.add(message)
    db.flush()
    db.add_all(
        [MessageRecipient(message_id=message.id, recipient_id=recipient.id) for recipient in recipients]
    )
    write_audit(
        db,
        sender,
        "create",
        "message",
        message.id,
        ["channel", "audience", "districts", "title", "body", "recipient_count"],
    )
    db.commit()
    db.refresh(message)
    return message


def list_recipient_options(db: Session, role: str) -> list[User]:
    if role not in RECIPIENT_ROLES:
        raise DomainError("Select a field officer or farmer.", field="role")
    return list(
        db.scalars(
            select(User)
            .where(User.role == role, User.is_active.is_(True))
            .order_by(User.full_name, User.id)
        ).all()
    )


def list_recipient_groups(db: Session) -> list[tuple[str, str | None, int]]:
    officer_count = db.scalar(
        select(func.count(User.id)).where(
            User.role == UserRole.field_officer.value, User.is_active.is_(True)
        )
    ) or 0
    farmer_count = db.scalar(
        select(func.count(User.id)).where(User.role == UserRole.farmer.value, User.is_active.is_(True))
    ) or 0
    district_rows = db.execute(
        select(Farmer.district, func.count(User.id))
        .join(User, User.id == Farmer.user_id)
        .where(
            User.role == UserRole.farmer.value,
            User.is_active.is_(True),
            Farmer.district.is_not(None),
            Farmer.district != "",
        )
        .group_by(Farmer.district)
        .order_by(Farmer.district)
    ).all()
    return [
        ("field_officer", None, int(officer_count)),
        ("farmer", None, int(farmer_count)),
        *[("farmer", district, int(count)) for district, count in district_rows],
    ]


def list_sent_messages(
    db: Session,
    page: int = 1,
    page_size: int = 20,
    query: str | None = None,
    channel: str | None = None,
    audience: str | None = None,
    sort: str = "created_at",
    direction: str = "desc",
) -> tuple[list[tuple[Message, int]], int]:
    filters = []
    if query and query.strip():
        term = f"%{query.strip()}%"
        filters.append(or_(Message.title.ilike(term), Message.body.ilike(term)))
    if channel:
        filters.append(Message.channel == channel)
    if audience:
        filters.append(Message.audience == audience)
    total = db.scalar(select(func.count(Message.id)).where(*filters)) or 0
    recipient_count = func.count(MessageRecipient.id)
    sort_column = recipient_count if sort == "recipient_count" else getattr(Message, sort, Message.created_at)
    ordering = sort_column.asc() if direction == "asc" else sort_column.desc()
    rows = db.execute(
        select(Message, recipient_count)
        .outerjoin(MessageRecipient, MessageRecipient.message_id == Message.id)
        .options(joinedload(Message.target_user))
        .where(*filters)
        .group_by(Message.id, Message.target_user_id)
        .order_by(ordering, Message.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return [(message, int(count)) for message, count in rows], int(total)


def list_notifications(db: Session, user_id: uuid.UUID) -> tuple[list[MessageRecipient], int]:
    rows = list(
        db.scalars(
            select(MessageRecipient)
            .join(MessageRecipient.message)
            .options(joinedload(MessageRecipient.message).joinedload(Message.sender))
            .where(MessageRecipient.recipient_id == user_id)
            .order_by(Message.created_at.desc())
            .limit(100)
        ).all()
    )
    unread = db.scalar(
        select(func.count(MessageRecipient.id)).where(
            MessageRecipient.recipient_id == user_id,
            MessageRecipient.read_at.is_(None),
        )
    )
    return rows, int(unread or 0)


def mark_notification_read(db: Session, user_id: uuid.UUID, message_id: uuid.UUID) -> None:
    notification = db.scalar(
        select(MessageRecipient).where(
            MessageRecipient.message_id == message_id,
            MessageRecipient.recipient_id == user_id,
        )
    )
    if notification is None:
        raise DomainError("Notification was not found.", status_code=404)
    if notification.read_at is None:
        notification.read_at = utcnow()
        db.commit()


def mark_all_notifications_read(db: Session, user_id: uuid.UUID) -> None:
    db.execute(
        update(MessageRecipient)
        .where(MessageRecipient.recipient_id == user_id, MessageRecipient.read_at.is_(None))
        .values(read_at=utcnow())
    )
    db.commit()
