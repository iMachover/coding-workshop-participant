"""Registration and login rules."""

from typing import Any

import db
from errors import ConflictError, UnauthorizedError
from repositories import user_repository
from schemas import RegisterRequest
from security import DUMMY_HASH, hash_password, verify_password

INVALID_LOGIN = "Invalid email or password"


def register(data: RegisterRequest) -> dict[str, Any]:
    """Create an employee account. Raises ConflictError if the email is taken."""
    # Hash before opening the transaction; it's deliberately slow.
    password_hash = hash_password(data.password)
    with db.transaction() as conn:
        user = user_repository.insert(
            conn, data.email, data.full_name, data.phone_number, password_hash
        )
    if user is None:
        raise ConflictError("An account with this email already exists")
    return user


def get_current_user(user_id: int) -> dict[str, Any]:
    """Resolve the caller's identity. Raises UnauthorizedError if no such user exists."""
    with db.transaction() as conn:
        user = user_repository.get_by_id(conn, user_id)
    if user is None:
        raise UnauthorizedError("Unknown user")
    return user


def login(email: str, password: str) -> dict[str, Any]:
    """Return the user if the credentials match. The same error for a wrong email or password."""
    with db.transaction() as conn:
        user = user_repository.get_with_password_hash_by_email(conn, email)
    if user is None:
        verify_password(password, DUMMY_HASH)
        raise UnauthorizedError(INVALID_LOGIN)
    if not verify_password(password, user.pop("password_hash")):
        raise UnauthorizedError(INVALID_LOGIN)
    return user
