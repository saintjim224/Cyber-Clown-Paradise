from functools import lru_cache

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
