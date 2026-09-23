"""Registration and login rules."""

from typing import Any

import db
from errors import ConflictError, UnauthorizedError
from repositories import user_repository
from schemas import RegisterRequest
from security import DUMMY_HASH, hash_password, verify_password
from tokens import create_access_token, decode_access_token

INVALID_LOGIN = "Invalid email or password"
ROLE_CHANGED = "Your access has changed. Please sign in again."


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


def user_from_token(token: str) -> dict[str, Any]:
    """Verify an access token, then load its user and confirm the role still matches.

    The database is the source of truth: a deleted account or a changed role makes an
    otherwise valid token useless, so permissions never outlive a demotion.
    """
    claims = decode_access_token(token)
    user = get_current_user(claims.user_id)
    if user["role"] != claims.role:
        raise UnauthorizedError(ROLE_CHANGED)
    return user


def login(email: str, password: str) -> dict[str, Any]:
    """Check credentials and issue an access token.

    Returns {access_token, token_type, expires_in, user}. The token is signed with the
    user id and role read from the database just now. A wrong email and a wrong
    password get the same error.
    """
    with db.transaction() as conn:
        user = user_repository.get_with_password_hash_by_email(conn, email)
    if user is None:
        verify_password(password, DUMMY_HASH)
        raise UnauthorizedError(INVALID_LOGIN)
    if not verify_password(password, user.pop("password_hash")):
        raise UnauthorizedError(INVALID_LOGIN)
    token, expires_in = create_access_token(user["user_id"], user["role"])
    # "bearer" is the token type's name, not a credential; bandit flags the word "token".
    return {"access_token": token, "token_type": "bearer", "expires_in": expires_in, "user": user}  # nosec B105
