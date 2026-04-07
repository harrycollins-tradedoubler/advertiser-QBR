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
    qbr_agent_webhook_url: str = "https://coe-n8n.coe-untrust-eu-de.prod.tddrift.net/webhook/qbr-v4-presenton-1e2f9f4d"

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
