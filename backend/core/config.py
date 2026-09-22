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
    postgres_name: str = os.getenv("POSTGRES_NAME", "codingworkshop")
    postgres_user: str = os.getenv("POSTGRES_USER", "test")
    postgres_pass: str = os.getenv("POSTGRES_PASS", "test")
    cors_origins: list[str] = field(
        default_factory=lambda: _split_csv(
            os.getenv("CORS_ORIGINS", "http://localhost:3000")
        )
    )


settings = Settings()
