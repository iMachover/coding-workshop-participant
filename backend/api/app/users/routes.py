"""HTTP routes for the authenticated user's own profile."""

from fastapi import APIRouter

from app.core.deps import CurrentUser
from app.users.schemas import UserPublic

router = APIRouter(tags=["users"])


@router.get("/me", response_model=UserPublic)
def read_me(user: CurrentUser) -> UserPublic:
    """Return the profile of the user identified by the token."""
    return UserPublic(**user)
