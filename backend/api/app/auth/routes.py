"""HTTP routes for authentication."""

import psycopg
from fastapi import APIRouter, Depends

from app.auth import service
from app.auth.schemas import LoginRequest, LoginResponse
from app.db.connection import get_db
from app.users.schemas import UserPublic

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: psycopg.Connection = Depends(get_db)) -> LoginResponse:
    """Exchange username + password for a JWT."""
    token, expires_in, user = service.authenticate(db, body.username, body.password)
    return LoginResponse(token=token, expires_in=expires_in, user=UserPublic(**user))
