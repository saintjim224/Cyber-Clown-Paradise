from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    web_origin: str = "http://localhost:3000"
    database_url: str = "sqlite+aiosqlite:///./cyberjoker_dev.db"
    redis_url: str = "redis://localhost:6379/0"
    openai_api_key: str = ""
    openai_model: str = "gpt-5.5"
    openai_timeout_seconds: int = 18
    openai_enable_remote: bool = False
    s3_endpoint_url: str = "http://localhost:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_bucket: str = "cyberjoker-assets"
    media_retention_hours: int = 24
    autonomy_tick_seconds: int = 45
    triposr_endpoint_url: str = ""
    admin_username: str = "admin"
    admin_password: str = ""
    admin_secret_key: str = ""
    admin_session_seconds: int = 60 * 60 * 8
    admin_super_hosts: str = "127.0.0.1,::1,localhost"
    testing: bool = Field(default=False)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def sqlalchemy_url(self) -> str:
        if self.database_url.startswith("postgresql://"):
            return self.database_url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return self.database_url


@lru_cache
def get_settings() -> Settings:
    return Settings()


def _clean_env_value(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def _admin_env_file_overrides() -> dict[str, str]:
    env_file = Settings.model_config.get("env_file") or ".env"
    env_path = Path(str(env_file))
    if not env_path.exists():
        return {}

    admin_keys = {
        "ADMIN_USERNAME": "admin_username",
        "ADMIN_PASSWORD": "admin_password",
        "ADMIN_SECRET_KEY": "admin_secret_key",
        "ADMIN_SESSION_SECONDS": "admin_session_seconds",
        "ADMIN_SUPER_HOSTS": "admin_super_hosts",
    }
    values: dict[str, str] = {}
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        field_name = admin_keys.get(key.strip())
        if field_name:
            values[field_name] = _clean_env_value(value)
    return values


def get_runtime_settings() -> Settings:
    settings = Settings()
    if settings.testing:
        return settings
    return Settings(**_admin_env_file_overrides())
