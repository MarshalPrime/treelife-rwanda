"""Runtime configuration. Secrets come from the environment, never from source."""

from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_ROOT.parent
LOCAL_DATABASE_URL = "postgresql+psycopg://treelife:treelife@localhost:5432/treelife"


def normalize_database_url(url: str) -> str:
    """Use the psycopg driver and a connection string Neon accepts."""
    cleaned = url.strip()
    if cleaned.startswith("postgres://"):
        cleaned = "postgresql://" + cleaned[len("postgres://") :]
    if cleaned.startswith("postgresql://"):
        cleaned = "postgresql+psycopg://" + cleaned[len("postgresql://") :]
    for token in ("channel_binding=require", "pgbouncer=true"):
        cleaned = cleaned.replace(f"&{token}", "")
        cleaned = cleaned.replace(f"?{token}&", "?")
        cleaned = cleaned.replace(f"?{token}", "")
    hosted = "localhost" not in cleaned and "127.0.0.1" not in cleaned
    if hosted and "sslmode=" not in cleaned:
        cleaned += "&sslmode=require" if "?" in cleaned else "?sslmode=require"
    return cleaned


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", BACKEND_ROOT / ".env"),
        extra="ignore",
    )

    app_env: str = "development"
    secret_key: str = "dev-only-change-me-use-a-long-random-string"
    database_url: str = LOCAL_DATABASE_URL
    postgres_url: str | None = None
    postgres_url_non_pooling: str | None = None
    cors_origins: str = "http://localhost:3000"
    access_token_expire_minutes: int = 480
    seed_demo_data: bool = False
    demo_admin_password: str = "demo-admin-pass"
    demo_officer_password: str = "demo-officer-pass"
    demo_viewer_password: str = "demo-viewer-pass"
    demo_farmer_password: str = "demo-farmer-pass"

    @model_validator(mode="after")
    def prefer_hosted_database(self):
        # Prefer a direct Neon connection. The pooled URL rejects schema changes.
        if self.database_url == LOCAL_DATABASE_URL or "-pooler" in self.database_url:
            hosted = self.postgres_url_non_pooling or self.postgres_url
            if hosted:
                self.database_url = hosted
        self.database_url = normalize_database_url(self.database_url)
        return self

    @property
    def uses_hosted_database(self) -> bool:
        return "localhost" not in self.database_url and "127.0.0.1" not in self.database_url

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
