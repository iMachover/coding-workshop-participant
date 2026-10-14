"""
Application settings loaded from environment variables.

Database variables (POSTGRES_*) and IS_LOCAL are injected by Terraform
(see infra/locals.tf). JWT_SECRET is also injected by Terraform; it must
never be committed or shipped to the frontend. Settings are read lazily so
importing the app never fails and tests can set the environment first.
"""

import os
from dataclasses import dataclass
from functools import lru_cache


class ConfigError(RuntimeError):
    """Raised when a required environment variable is missing."""


def _require(name: str) -> str:
    """Return the environment variable or raise a clear ConfigError."""
    value = os.getenv(name, "").strip()
    if not value:
        raise ConfigError(f"Missing required environment variable: {name}")
    return value


@dataclass(frozen=True)
class Settings:
    """Immutable runtime configuration."""

    is_local: bool
    jwt_secret: str
    jwt_algorithm: str
    jwt_expires_minutes: int
    cors_origins: tuple[str, ...]
    postgres_conninfo: str


def _build_conninfo(is_local: bool) -> str:
    """Build a libpq connection string from POSTGRES_* variables."""
    parts = {
        "host": os.getenv("POSTGRES_HOST", "localhost"),
        "port": os.getenv("POSTGRES_PORT", "5432"),
        "user": os.getenv("POSTGRES_USER", os.getenv("USER", "postgres")),
        "dbname": os.getenv("POSTGRES_NAME", "project_tracker"),
        "connect_timeout": "15",
    }
    password = os.getenv("POSTGRES_PASS", "")
    if password:
        parts["password"] = password
    if not is_local:
        # Aurora requires TLS; local PostgreSQL does not run with SSL.
        parts["sslmode"] = "require"
    return " ".join(f"{key}={value}" for key, value in parts.items())


@lru_cache
def get_settings() -> Settings:
    """Load settings once per process (per Lambda container)."""
    is_local = os.getenv("IS_LOCAL", "true").lower() == "true"
    origins = tuple(
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
        if origin.strip()
    )
    return Settings(
        is_local=is_local,
        jwt_secret=_require("JWT_SECRET"),
        jwt_algorithm="HS256",
        jwt_expires_minutes=int(os.getenv("JWT_EXPIRES_MINUTES", "480")),
        cors_origins=origins,
        postgres_conninfo=_build_conninfo(is_local),
    )
