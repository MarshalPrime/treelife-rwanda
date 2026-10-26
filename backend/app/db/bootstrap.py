"""Create the hosted schema once, on the first request that needs it."""

from threading import Lock

from app.core.config import get_settings
from app.domain.errors import DomainError

_lock = Lock()
_ready = False


def database_failure(exc: BaseException) -> str:
    origin = getattr(exc, "orig", None)
    code = getattr(origin, "sqlstate", None) or getattr(origin, "pgcode", None)
    label = exc.__class__.__name__
    return f"{label}:{code}" if code else label


def ensure_hosted_database() -> None:
    """Apply migrations and demonstration accounts when this process uses Neon."""
    global _ready
    if _ready or not get_settings().uses_hosted_database:
        return
    with _lock:
        if _ready or not get_settings().uses_hosted_database:
            return
        try:
            from pathlib import Path

            from alembic.config import Config
            from sqlalchemy import select

            from alembic import command
            from app.db.session import SessionLocal
            from app.models.entities import User
            from app.seed import seed

            ini = Path(__file__).resolve().parents[2] / "alembic.ini"
            command.upgrade(Config(str(ini)), "head")
            db = SessionLocal()
            try:
                ready = db.scalar(select(User.id).where(User.email == "admin@demo.treelife.local"))
            finally:
                db.close()
            if ready is None:
                seed(allow_production=True)
        except Exception as exc:
            print(f"Hosted database setup failed: {database_failure(exc)}")
            raise DomainError(
                f"Database is unavailable ({database_failure(exc)}).",
                status_code=503,
            ) from exc
        _ready = True
