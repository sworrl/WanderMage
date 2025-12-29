from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    APP_NAME: str = "WanderMage"
    DEBUG: bool = True

    # Database - 3 Database Architecture
    DATABASE_URL: str
    POI_DATABASE_URL: str = ""  # POI database (campgrounds, fuel stations, etc.)
    ROAD_DATABASE_URL: str = ""  # Road hazards database (overpass heights, railroad crossings)

    # Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 43200  # 30 days

    # File uploads
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024  # 10MB

    # CORS
    CORS_ORIGINS: str = "https://localhost:3000,https://localhost:8080"

    # SSL
    SSL_CERTFILE: str = "ssl/cert.pem"
    SSL_KEYFILE: str = "ssl/key.pem"

    class Config:
        env_file = ".env"

    @property
    def cors_origins_list(self) -> List[str]:
        """Convert comma-separated CORS_ORIGINS to list"""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]


settings = Settings()
