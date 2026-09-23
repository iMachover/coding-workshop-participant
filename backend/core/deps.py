"""FastAPI dependencies shared by routers.

Identity comes from the X-User-Id header for now. When JWT arrives, only
get_current_user changes: it will read the token instead, and every route
that uses CurrentUser keeps working as-is.
"""

from typing import Annotated, Any

from fastapi import Depends, Header

from errors import UnauthorizedError
from services import auth_service

# Postgres INTEGER range, so a huge header value is a 401 rather than a DB error.
MAX_USER_ID = 2_147_483_647


def get_current_user(
    x_user_id: Annotated[str | None, Header()] = None,
) -> dict[str, Any]:
    """Return the calling user, or raise UnauthorizedError if the header is missing or unknown."""
    try:
        user_id = int(x_user_id or "")
    except ValueError:
        raise UnauthorizedError("Missing or invalid X-User-Id header") from None
    if not 1 <= user_id <= MAX_USER_ID:
        raise UnauthorizedError("Missing or invalid X-User-Id header")
    return auth_service.get_current_user(user_id)


CurrentUser = Annotated[dict[str, Any], Depends(get_current_user)]
