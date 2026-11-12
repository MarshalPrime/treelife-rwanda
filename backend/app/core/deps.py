"""Authenticated API dependencies."""

from __future__ import annotations

import uuid

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.entities import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token", auto_error=False)

WRITER_ROLES = {UserRole.field_officer.value, UserRole.farmer.value}
STAFF_ROLES = {UserRole.field_officer.value}


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    if not token:
        raise HTTPException(
            status_code=401,
            detail="Authentication is required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_access_token(token)
        user_id = uuid.UUID(str(payload.get("sub")))
    except (jwt.PyJWTError, ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=401,
            detail="Authentication is required.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=401,
            detail="Authentication is required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_writer(user: User = Depends(get_current_user)) -> User:
    if user.role not in WRITER_ROLES:
        raise HTTPException(status_code=403, detail="You do not have permission to change records.")
    return user


def require_staff(user: User = Depends(get_current_user)) -> User:
    if user.role not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="Only a field officer can open a login.")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.admin.value:
        raise HTTPException(status_code=403, detail="This action is limited to administrators.")
    return user


def require_forest_writer(user: User = Depends(get_current_user)) -> User:
    if user.role not in {UserRole.admin.value, UserRole.field_officer.value}:
        raise HTTPException(
            status_code=403,
            detail="Only an administrator or field officer can register a forest.",
        )
    return user


def require_attention(user: User = Depends(get_current_user)) -> User:
    if user.role not in {UserRole.admin.value, UserRole.field_officer.value}:
        raise HTTPException(
            status_code=403,
            detail="Only an administrator or field officer can see these notices.",
        )
    return user
