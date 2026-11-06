"""Optional profile photos for farmers and field officers."""

from __future__ import annotations

from pathlib import Path

from app.core.config import get_settings
from app.domain.errors import DomainError
from app.models.entities import User
from app.services.common import utcnow

MAX_PHOTO_BYTES = 2 * 1024 * 1024
MEDIA_TYPES = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}


def photo_directory() -> Path:
    directory = Path(get_settings().profile_photo_dir)
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def detect_photo(data: bytes) -> str | None:
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if len(data) >= 12 and data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "webp"
    return None


def photo_file(user: User) -> Path | None:
    if not user.profile_photo_ext:
        return None
    path = photo_directory() / f"{user.id}.{user.profile_photo_ext}"
    return path if path.is_file() else None


def save_profile_photo(user: User, data: bytes) -> None:
    if not data:
        raise DomainError("Choose a photo to upload.", field="photo")
    if len(data) > MAX_PHOTO_BYTES:
        raise DomainError("Choose a photo smaller than 2 MB.", field="photo")
    extension = detect_photo(data)
    if extension is None:
        raise DomainError("Use a JPEG, PNG, or WebP photo.", field="photo")
    directory = photo_directory()
    for old in directory.glob(f"{user.id}.*"):
        old.unlink()
    (directory / f"{user.id}.{extension}").write_bytes(data)
    user.profile_photo_ext = extension
    user.profile_photo_at = utcnow()


def delete_profile_photo(user: User) -> None:
    path = photo_file(user)
    if path is not None:
        path.unlink()
    for old in photo_directory().glob(f"{user.id}.*"):
        old.unlink()
    user.profile_photo_ext = None
    user.profile_photo_at = None
