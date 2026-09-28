from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/dz_quant"
    jwt_secret: str = Field(default="development-only-change-me-please", min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = Field(default=60, gt=0)


@lru_cache
def get_settings() -> Settings:
    return Settings()

