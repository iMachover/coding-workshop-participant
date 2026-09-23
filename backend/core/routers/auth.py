"""Account routes: register and login. No tokens yet; clients send X-User-Id afterwards."""

from typing import Any

from fastapi import APIRouter, status

from schemas import LoginRequest, RegisterRequest, UserResponse
from services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=UserResponse)
def register(body: RegisterRequest) -> dict[str, Any]:
    """Create an employee account with an @acme.inc email."""
    return auth_service.register(body)


@router.post("/login", response_model=UserResponse)
def login(body: LoginRequest) -> dict[str, Any]:
    """Check credentials and return the user, including the user_id to send as X-User-Id."""
    return auth_service.login(body.email, body.password)
