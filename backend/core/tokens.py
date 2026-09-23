"""Signed access tokens (JWT, HS256).

A token carries only the user id (`sub`), role, issue time, expiry and issuer. It never
contains a password, email or any other personal data. The signing secret comes from
the JWT_SECRET environment variable.
"""

import logging
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt

from config import settings
from errors import UnauthorizedError

logger = logging.getLogger(__name__)

ALGORITHM = "HS256"
ISSUER = "facilities-helpdesk"
ROLES = frozenset({"employee", "engineer", "admin"})
# HS256 needs at least 256 bits of key; 32 characters is the floor we accept.
MIN_SECRET_LENGTH = 32

# Messages shown to the user, not credentials; bandit flags the word "TOKEN" in the names.
INVALID_TOKEN = "Invalid token. Please sign in again."  # nosec B105
EXPIRED_TOKEN = "Your session has expired. Please sign in again."  # nosec B105

_local_secret: str | None = None


@dataclass(frozen=True)
class TokenClaims:
    """What a verified token says about its holder."""

    user_id: int
    role: str


def _signing_secret() -> str:
    """The configured secret. Locally, a random per-process one if none is set."""
    global _local_secret
    if settings.jwt_secret:
        if len(settings.jwt_secret) < MIN_SECRET_LENGTH:
            raise RuntimeError(f"JWT_SECRET must be at least {MIN_SECRET_LENGTH} characters")
        return settings.jwt_secret
    if not settings.is_local:
        raise RuntimeError("JWT_SECRET is not set")
    if _local_secret is None:
        # Never a hard-coded fallback: a restart signs everyone out instead.
        _local_secret = secrets.token_urlsafe(48)
        logger.warning("JWT_SECRET is not set; using a random secret until this process exits")
    return _local_secret


def create_access_token(user_id: int, role: str, now: datetime | None = None) -> tuple[str, int]:
    """Sign a token for this user. Returns (token, seconds until it expires)."""
    issued_at = now or datetime.now(UTC)
    lifetime = timedelta(minutes=settings.jwt_expires_minutes)
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": issued_at,
        "exp": issued_at + lifetime,
        "iss": ISSUER,
    }
    return jwt.encode(payload, _signing_secret(), algorithm=ALGORITHM), int(lifetime.total_seconds())


def decode_access_token(token: str) -> TokenClaims:
    """Verify the signature, expiry and issuer. Raises UnauthorizedError if anything is off."""
    try:
        payload = jwt.decode(
            token,
            _signing_secret(),
            # Only HS256: rejects "alg": "none" and algorithm-swapping tokens.
            algorithms=[ALGORITHM],
            issuer=ISSUER,
            options={"require": ["sub", "role", "iat", "exp", "iss"]},
        )
    except jwt.ExpiredSignatureError:
        raise UnauthorizedError(EXPIRED_TOKEN) from None
    except jwt.InvalidTokenError:
        raise UnauthorizedError(INVALID_TOKEN) from None

    subject, role = payload["sub"], payload["role"]
    if not (isinstance(subject, str) and subject.isdecimal()) or role not in ROLES:
        raise UnauthorizedError(INVALID_TOKEN)
    return TokenClaims(user_id=int(subject), role=role)
