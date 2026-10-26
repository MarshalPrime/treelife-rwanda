"""Runtime configuration. Secrets come from the environment, never from source."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_ROOT.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", BACKEND_ROOT / ".env"),
        extra="ignore",
    )

    app_env: str = "development"
    secret_key: str = "dev-only-change-me-use-a-long-random-string"
    database_url: str = "postgresql+psycopg://treelife:treelife@localhost:5432/treelife"
    cors_origins: str = "http://localhost:3000"
    access_token_expire_minutes: int = 480
    seed_demo_data: bool = False
    demo_admin_password: str = "demo-admin-pass"
    demo_officer_password: str = "demo-officer-pass"
    demo_viewer_password: str = "demo-viewer-pass"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
