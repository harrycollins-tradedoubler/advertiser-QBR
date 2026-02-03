from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App settings
    app_name: str = "Agent Hub"
    debug: bool = False

    # CORS
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    # Neon PostgreSQL REST API
    neon_api_url: str = ""
    neon_data_api_token: str = ""

    # Direct Postgres connection (recommended if you don't want Neon Auth)
    database_url: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
