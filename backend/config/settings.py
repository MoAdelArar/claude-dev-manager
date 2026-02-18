from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    APP_NAME: str = "AdelBot"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    DATABASE_URL: str = "postgresql+asyncpg://adelbot:adelbot@localhost:5432/adelbot"
    DATABASE_URL_SYNC: str = "postgresql://adelbot:adelbot@localhost:5432/adelbot"

    REDIS_URL: str = "redis://localhost:6379/0"

    SECRET_KEY: str = "change-me-in-production-use-openssl-rand-hex-32"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 1 week
    ALGORITHM: str = "HS256"

    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""
    GITHUB_REDIRECT_URI: str = "adelbot://callback"

    # Comma-separated GitHub usernames that are auto-promoted to admin on login
    ADMIN_GITHUB_USERNAMES: str = ""

    # Claude Code configuration
    ANTHROPIC_API_KEY: str = ""
    CLAUDE_CODE_MODEL: str = ""  # empty = let claude code pick default
    CLAUDE_CODE_MAX_TURNS: int = 0  # 0 = unlimited

    DOCKER_HOST: str = "unix:///var/run/docker.sock"
    CONTAINER_NETWORK: str = "adelbot-network"
    CONTAINER_IMAGE_PREFIX: str = "adelbot-dev"
    CONTAINER_MAX_LIFETIME_HOURS: int = 8
    CONTAINER_MEMORY_LIMIT: str = "2g"
    CONTAINER_CPU_LIMIT: float = 2.0

    STRIPE_API_KEY: Optional[str] = None
    STRIPE_WEBHOOK_SECRET: Optional[str] = None

    RATE_PER_MINUTE: float = 0.01  # $0.01 per minute of container time
    FREE_MINUTES_PER_MONTH: int = 60

    CORS_ORIGINS: list[str] = ["*"]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
