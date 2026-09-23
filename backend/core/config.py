"""Runtime settings for the core service, read once from environment variables."""

import os
from dataclasses import dataclass, field


def _split_csv(value: str) -> list[str]:
    """Split a comma-separated string into a list of trimmed, non-empty items."""
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    """Service configuration. Terraform drops empty vars, so every field has a default."""

    is_local: bool = os.getenv("IS_LOCAL", "true").lower() == "true"
    postgres_host: str = os.getenv("POSTGRES_HOST", "localhost")
    postgres_port: int = int(os.getenv("POSTGRES_PORT", "5432"))
    postgres_name: str = os.getenv("POSTGRES_NAME", "codingworkshop")
    postgres_user: str = os.getenv("POSTGRES_USER", "test")
    # repr=False keeps secrets out of logs and error messages that print settings.
    postgres_pass: str = field(default=os.getenv("POSTGRES_PASS", "test"), repr=False)
    # Signs access tokens (HS256). Required in AWS; see tokens.py for local development.
    jwt_secret: str = field(default=os.getenv("JWT_SECRET", ""), repr=False)
    jwt_expires_minutes: int = int(os.getenv("JWT_EXPIRES_MINUTES", "60"))
    cors_origins: list[str] = field(
        default_factory=lambda: _split_csv(
            os.getenv("CORS_ORIGINS", "http://localhost:3000")
        )
    )

    @property
    def postgres_sslmode(self) -> str:
        """Aurora requires SSL; local Homebrew Postgres has none."""
        return "disable" if self.is_local else "require"


settings = Settings()
