"""Account routes: register, login (issues a signed access token) and the current user."""

from typing import Any

from fastapi import APIRouter, status

from deps import CurrentUser
from schemas import LoginRequest, LoginResponse, RegisterRequest, UserResponse
from services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=UserResponse)
def register(body: RegisterRequest) -> dict[str, Any]:
    """Create an employee account with an @acme.inc email."""
    return auth_service.register(body)


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest) -> dict[str, Any]:
    """Check credentials and return a signed access token plus the user."""
    return auth_service.login(body.email, body.password)


@router.get("/me", response_model=UserResponse)
def me(user: CurrentUser) -> dict[str, Any]:
    """Return the signed-in caller. Any role."""
    return user
