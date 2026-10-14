"""Request and response models for authentication."""

from pydantic import BaseModel, Field, field_validator

from app.users.schemas import UserPublic


class LoginRequest(BaseModel):
    """Credentials submitted by the login form."""

    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=72)

    @field_validator("username")
    @classmethod
    def strip_username(cls, value: str) -> str:
        """Usernames never contain surrounding whitespace."""
        stripped = value.strip()
        if not stripped:
            raise ValueError("Username is required")
        return stripped


class LoginResponse(BaseModel):
    """A signed token plus the public profile of the user it belongs to."""

    token: str
    token_type: str = "Bearer"
    expires_in: int
    user: UserPublic
