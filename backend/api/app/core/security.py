"""
Password hashing and JSON Web Token helpers.

Passwords are hashed with bcrypt. Tokens are HS256 JWTs signed with
JWT_SECRET and carry the user id (sub), username and role.
"""

from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from app.core.config import get_settings
from app.core.errors import AppError

# bcrypt only reads the first 72 bytes of a password.
MAX_PASSWORD_BYTES = 72

# Used when the username does not exist so that a failed login takes the same
# time as a wrong password (avoids username enumeration via timing).
_DUMMY_HASH = bcrypt.hashpw(b"not-a-real-password", bcrypt.gensalt(rounds=12)).decode()


def hash_password(password: str) -> str:
    """Return a bcrypt hash for the given plaintext password."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, password_hash: str | None) -> bool:
    """Check a plaintext password against a stored bcrypt hash."""
    candidate = (password_hash or _DUMMY_HASH).encode("utf-8")
    try:
        matched = bcrypt.checkpw(password.encode("utf-8"), candidate)
    except ValueError:
        return False
    return matched and password_hash is not None


def create_access_token(user_id: int, username: str, role: str) -> tuple[str, int]:
    """Create a signed JWT. Returns (token, expires_in_seconds)."""
    settings = get_settings()
    now = datetime.now(timezone.utc)
    expires_in = settings.jwt_expires_minutes * 60
    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "iat": now,
        "exp": now + timedelta(seconds=expires_in),
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, expires_in


def decode_access_token(token: str) -> dict[str, Any]:
    """Validate a JWT and return its claims, or raise a 401 AppError."""
    settings = get_settings()
    try:
        return jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["sub", "exp"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise AppError(401, "TOKEN_EXPIRED", "Your session has expired. Please log in again.") from exc
    except jwt.InvalidTokenError as exc:
        raise AppError(401, "TOKEN_INVALID", "Invalid authentication token") from exc
