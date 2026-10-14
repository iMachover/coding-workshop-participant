"""
FastAPI dependencies for authentication and role checks.

Every protected route depends on get_current_user, which validates the
Bearer token and loads the live user row so archived users are rejected
immediately, even with a still-valid token.
"""

from collections.abc import Callable
from typing import Annotated, Any

import psycopg
from fastapi import Depends, Header

from app.core.errors import AppError
from app.core.security import decode_access_token
from app.db.connection import get_db
from app.users import repository as users_repo


def _extract_bearer(authorization: str | None) -> str:
    """Pull the raw token out of an Authorization header."""
    if not authorization:
        raise AppError(401, "UNAUTHORIZED", "Authentication required")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise AppError(401, "UNAUTHORIZED", "Authorization header must be 'Bearer <token>'")
    return token.strip()


def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    db: psycopg.Connection = Depends(get_db),
) -> dict[str, Any]:
    """Resolve the authenticated user from the request's JWT."""
    claims = decode_access_token(_extract_bearer(authorization))
    try:
        user_id = int(claims["sub"])
    except (TypeError, ValueError) as exc:
        raise AppError(401, "TOKEN_INVALID", "Invalid authentication token") from exc

    user = users_repo.find_by_id(db, user_id)
    if user is None or user["is_archived"]:
        raise AppError(401, "UNAUTHORIZED", "Account not found or archived")
    return user


CurrentUser = Annotated[dict[str, Any], Depends(get_current_user)]


def require_roles(*roles: str) -> Callable[..., dict[str, Any]]:
    """Dependency factory: allow only users whose role is in `roles`."""

    def _check(user: CurrentUser) -> dict[str, Any]:
        if user["role"] not in roles:
            raise AppError(403, "FORBIDDEN", "You do not have permission to perform this action")
        return user

    return _check
