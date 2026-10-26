"""Shared persistence helpers for registration records."""

from __future__ import annotations

import enum
import secrets
import uuid
from datetime import UTC, datetime
from typing import Any

from geoalchemy2.elements import WKTElement
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.errors import DomainError
from app.models.entities import AuditLog, User


def utcnow() -> datetime:
    return datetime.now(UTC)


def make_public_code(prefix: str) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    suffix = "".join(secrets.choice(alphabet) for _ in range(6))
    return f"{prefix}-{datetime.now(UTC).year}-{suffix}"


def allocate_code(db: Session, model: type, prefix: str) -> str:
    for _ in range(8):
        code = make_public_code(prefix)
        exists = db.scalar(select(model.id).where(model.public_code == code))
        if exists is None:
            return code
    raise DomainError("Could not allocate a unique record code. Try again.", status_code=500)


def apply_point(instance: Any, latitude: float | None, longitude: float | None) -> None:
    """Store WGS 84 coordinates. WKT axis order is longitude, then latitude."""

    instance.latitude = latitude
    instance.longitude = longitude
    if latitude is None or longitude is None:
        instance.location = None
        return
    instance.location = WKTElement(f"POINT({longitude:.8f} {latitude:.8f})", srid=4326)


def stored_value(value: Any) -> Any:
    if isinstance(value, enum.Enum):
        return value.value
    return value


def apply_fields(instance: Any, data: dict[str, Any], fields: list[str]) -> list[str]:
    changed: list[str] = []
    for field in fields:
        if field not in data:
            continue
        new_value = stored_value(data[field])
        if getattr(instance, field) != new_value:
            setattr(instance, field, new_value)
            changed.append(field)
    return changed


def apply_coordinates(instance: Any, data: dict[str, Any]) -> list[str]:
    if "latitude" not in data and "longitude" not in data:
        return []
    latitude = data.get("latitude")
    longitude = data.get("longitude")
    if instance.latitude != latitude or instance.longitude != longitude:
        apply_point(instance, latitude, longitude)
        return ["coordinates"]
    return []


def write_audit(
    db: Session,
    actor: User | None,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID,
    changed_fields: list[str],
) -> None:
    db.add(
        AuditLog(
            actor_id=actor.id if actor else None,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id),
            changed_fields=changed_fields,
        )
    )


def find_by_request_id(db: Session, model: type, request_id: str | None) -> Any | None:
    if not request_id:
        return None
    return db.scalar(select(model).where(model.client_request_id == request_id))
