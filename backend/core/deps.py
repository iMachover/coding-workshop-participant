"""FastAPI dependencies shared by routers: who is calling, and whether their role may.

Authentication: `Authorization: Bearer <token>`. The token is verified, then the user
is reloaded from the database, so a deleted account or a changed role takes effect at
once. Authorization: routes declare the roles they allow with `require_role`, which
answers 403 for any other role. Every role check lives here.
"""

from collections.abc import Callable
from typing import Annotated, Any

from fastapi import Depends, Header, Path
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from errors import ForbiddenError, UnauthorizedError
from schemas import MAX_DB_ID, Role
from services import auth_service

# A numeric id in the URL. Out-of-range values get a 422 instead of reaching the DB.
IdPath = Annotated[int, Path(ge=1, le=MAX_DB_ID)]

MISSING_TOKEN = "Please sign in to continue."  # nosec B105 (a message, not a credential)
ACCESS_DENIED = "You don't have access to this."

# auto_error=False: a missing or non-Bearer header reaches get_current_user as None,
# so it gets our 401 message instead of FastAPI's default. Also adds /docs "Authorize".
bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    # TRANSITIONAL (J3): the old dev-only header, until the frontend and Postman send
    # tokens. Removed in J3 step 4. A Bearer token always wins over it.
    x_user_id: Annotated[str | None, Header()] = None,
) -> dict[str, Any]:
    """Return the signed-in caller, or raise UnauthorizedError (401)."""
    if credentials is not None:
        return auth_service.user_from_token(credentials.credentials)
    if x_user_id is None:
        raise UnauthorizedError(MISSING_TOKEN)
    try:
        user_id = int(x_user_id)
    except ValueError:
        raise UnauthorizedError(MISSING_TOKEN) from None
    if not 1 <= user_id <= MAX_DB_ID:
        raise UnauthorizedError(MISSING_TOKEN)
    return auth_service.get_current_user(user_id)


CurrentUser = Annotated[dict[str, Any], Depends(get_current_user)]


def require_role(*roles: Role) -> Callable[..., dict[str, Any]]:
    """A dependency that returns the caller if their role is allowed, else raises ForbiddenError (403)."""
    allowed = frozenset(roles)

    def check(user: CurrentUser) -> dict[str, Any]:
        if user["role"] not in allowed:
            raise ForbiddenError(ACCESS_DENIED)
        return user

    return check


# Employee self-service (/tickets). Engineers and admins get their own routes later.
EmployeeUser = Annotated[dict[str, Any], Depends(require_role("employee"))]
