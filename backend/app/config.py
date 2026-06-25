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

    # Tradedoubler API
    td_user_url: str = "https://connect.tradedoubler.com/usermanagement"
    td_manage_url: str = "https://connect.tradedoubler.com/advertiser"
    td_impersonate_url: str = "https://connect.tradedoubler.com/uaa/admin/impersonate"
    td_oauth_url: str = ""
    td_oauth_basic_auth: str = ""
    td_oauth_username: str = ""
    td_oauth_password: str = ""
    qbr_agent_webhook_url: str = "http://127.0.0.1:3021/webhook-local/advertiser-qbr"
    agency_qbr_agent_webhook_url: str = "http://127.0.0.1:3021/webhook-local/advertiser-qbr"

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
