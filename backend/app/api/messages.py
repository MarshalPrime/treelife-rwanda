"""HTTP routes for administrator messages and user notifications."""

from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_admin
from app.db.session import get_db
from app.models.entities import User
from app.schemas.messages import (
    MessageCreate,
    MessageHistoryPage,
    MessageRecipientGroup,
    MessageRecipientOption,
    MessageSent,
    NotificationList,
    NotificationRead,
)
from app.services.messages import (
    create_message,
    list_notifications,
    list_recipient_groups,
    list_recipient_options,
    list_sent_messages,
    mark_all_notifications_read,
    mark_notification_read,
)

router = APIRouter()


def sent_read(message, recipient_count: int) -> MessageSent:
    return MessageSent(
        id=message.id,
        channel=message.channel,
        audience=message.audience,
        districts=message.target_districts or [],
        recipient_user_id=message.target_user_id,
        recipient_name=message.target_user.full_name if message.target_user else None,
        title=message.title,
        body=message.body,
        recipient_count=recipient_count,
        created_at=message.created_at,
    )


def notification_read(notification) -> NotificationRead:
    return NotificationRead(
        id=notification.id,
        message_id=notification.message_id,
        title=notification.message.title,
        body=notification.message.body,
        sender_name=notification.message.sender.full_name,
        created_at=notification.message.created_at,
        read_at=notification.read_at,
    )


@router.get("/messages/recipients", response_model=list[MessageRecipientOption])
def get_message_recipients(
    role: str = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> list[MessageRecipientOption]:
    return [
        MessageRecipientOption(id=user.id, full_name=user.full_name, role=user.role)
        for user in list_recipient_options(db, role)
    ]


@router.get("/messages/groups", response_model=list[MessageRecipientGroup])
def get_message_groups(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> list[MessageRecipientGroup]:
    groups = []
    for role, district, count in list_recipient_groups(db):
        role_label = "Field officers" if role == "field_officer" else "Farmers"
        label = role_label if district is None else f"Farmers · {district}"
        key = role if district is None else f"{role}:{district}"
        groups.append(
            MessageRecipientGroup(
                key=key,
                role=role,
                district=district,
                label=label,
                recipient_count=count,
            )
        )
    return groups


@router.get("/messages", response_model=MessageHistoryPage)
def get_sent_messages(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    q: str | None = Query(default=None, max_length=160),
    channel: str | None = Query(default=None),
    audience: str | None = Query(default=None),
    sort: Literal["created_at", "title", "recipient_count"] = Query(default="created_at"),
    direction: Literal["asc", "desc"] = Query(default="desc"),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> MessageHistoryPage:
    rows, total = list_sent_messages(
        db,
        page=page,
        page_size=page_size,
        query=q,
        channel=channel,
        audience=audience,
        sort=sort,
        direction=direction,
    )
    return MessageHistoryPage(
        items=[sent_read(message, count) for message, count in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/messages", response_model=MessageSent, status_code=201)
def post_message(
    payload: MessageCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
) -> MessageSent:
    message = create_message(db, user, payload)
    return sent_read(message, len(message.recipients))


@router.get("/notifications", response_model=NotificationList)
def get_notifications(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NotificationList:
    notifications, unread_count = list_notifications(db, user.id)
    return NotificationList(
        items=[notification_read(notification) for notification in notifications],
        unread_count=unread_count,
    )


@router.post("/notifications/read-all", status_code=204)
def read_all_notifications(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    mark_all_notifications_read(db, user.id)
    return Response(status_code=204)


@router.post("/notifications/{message_id}/read", status_code=204)
def read_notification(
    message_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    mark_notification_read(db, user.id, message_id)
    return Response(status_code=204)
