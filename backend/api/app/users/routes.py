"""HTTP routes for the authenticated user's own profile and user administration."""

from typing import Any

import psycopg
from fastapi import APIRouter, Depends

from app.core.deps import CurrentUser, require_roles
from app.db.connection import get_db
from app.users import repository as users_repo
from app.users.schemas import UserPublic

router = APIRouter(tags=["users"])


@router.get("/me", response_model=UserPublic)
def read_me(user: CurrentUser) -> UserPublic:
    """Return the profile of the user identified by the token."""
    return UserPublic(**user)


@router.get("/users", response_model=list[UserPublic])
def list_users(
    _admin: dict[str, Any] = Depends(require_roles("admin")),
    db: psycopg.Connection = Depends(get_db),
) -> list[UserPublic]:
    """List every user. Admin only; the first role-restricted route."""
    return [UserPublic(**row) for row in users_repo.list_all(db)]
