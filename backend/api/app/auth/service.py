"""Authentication business rules."""

from typing import Any

import psycopg

from app.core.errors import AppError
from app.core.security import create_access_token, verify_password
from app.users import repository as users_repo


def authenticate(conn: psycopg.Connection, username: str, password: str) -> tuple[str, int, dict[str, Any]]:
    """
    Verify credentials and issue a token.

    The same generic error is returned for an unknown username, a wrong
    password and an archived account so the API never reveals which one failed.
    """
    user = users_repo.find_by_username(conn, username)
    password_hash = user["password_hash"] if user else None
    if not verify_password(password, password_hash) or user is None or user["is_archived"]:
        raise AppError(401, "INVALID_CREDENTIALS", "Invalid username or password")

    token, expires_in = create_access_token(user["id"], user["username"], user["role"])
    return token, expires_in, user
