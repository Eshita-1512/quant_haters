from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/dz_quant"
    jwt_secret: str = Field(default="development-only-change-me-please", min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = Field(default=60, gt=0)
    master_validation_path: Path = Path("private_data/master_validation.csv")
    max_upload_bytes: int = Field(default=1_000_000, gt=0)


@lru_cache
def get_settings() -> Settings:
    return Settings()
