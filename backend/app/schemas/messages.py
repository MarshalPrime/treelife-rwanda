"""Request and response models for in-app messages."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class MessageAudience(str, enum.Enum):
    field_officer = "field_officer"
    farmer = "farmer"
    individual = "individual"


class MessageChannel(str, enum.Enum):
    in_app = "in_app"
    sms = "sms"


class MessageCreate(BaseModel):
    channel: MessageChannel = MessageChannel.in_app
    audience: MessageAudience
    districts: list[str] = Field(default_factory=list, max_length=50)
    recipient_user_ids: list[uuid.UUID] = Field(default_factory=list, max_length=100)
    title: str = Field(min_length=1, max_length=160)
    body: str = Field(min_length=1, max_length=4000)

    @field_validator("title", "body")
    @classmethod
    def clean_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("This field is required.")
        return cleaned

    @field_validator("districts")
    @classmethod
    def clean_districts(cls, values: list[str]) -> list[str]:
        return sorted({value.strip() for value in values if value.strip()})

    @model_validator(mode="after")
    def validate_target(self) -> MessageCreate:
        if self.audience == MessageAudience.individual and not self.recipient_user_ids:
            raise ValueError("Select at least one recipient.")
        if self.audience != MessageAudience.individual and self.recipient_user_ids:
            raise ValueError("A group message cannot have individual recipients.")
        if self.audience != MessageAudience.farmer and self.districts:
            raise ValueError("District filters are only available for farmers.")
        return self


class MessageRecipientOption(BaseModel):
    id: uuid.UUID
    full_name: str
    role: str


class MessageRecipientGroup(BaseModel):
    key: str
    role: Literal["field_officer", "farmer"]
    district: str | None
    label: str
    recipient_count: int


class MessageSent(BaseModel):
    id: uuid.UUID
    channel: MessageChannel
    audience: MessageAudience
    districts: list[str]
    recipient_user_id: uuid.UUID | None
    recipient_name: str | None
    title: str
    body: str
    recipient_count: int
    created_at: datetime


class MessageHistoryPage(BaseModel):
    items: list[MessageSent]
    total: int
    page: int
    page_size: int


class NotificationRead(BaseModel):
    id: uuid.UUID
    message_id: uuid.UUID
    title: str
    body: str
    sender_name: str
    created_at: datetime
    read_at: datetime | None


class NotificationList(BaseModel):
    items: list[NotificationRead]
    unread_count: int
