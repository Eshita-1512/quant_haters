from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/dz_quant"
    jwt_secret: str = Field(default="development-only-change-me-please", min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = Field(default=420, gt=0)
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    production_frontend_url: str | None = None
    private_data_dir: Path = Path("private_data")
    master_validation_path: Path = Path("private_data/master_validation.csv")
    hidden_validation_path: Path = Path("private_data/hidden_validation.csv")
    max_upload_bytes: int = Field(default=1_000_000, gt=0)

    @property
    def allowed_cors_origins(self) -> list[str]:
        origins = list(self.cors_origins)
        if self.production_frontend_url and self.production_frontend_url not in origins:
            origins.append(self.production_frontend_url)
        return origins


@lru_cache
def get_settings() -> Settings:
    return Settings()
