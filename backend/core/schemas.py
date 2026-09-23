"""Pydantic request and response models. Shape and format validation only; FastAPI returns 422."""

import re
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, StringConstraints, field_validator

Role = Literal["employee", "engineer", "admin"]

ACME_EMAIL = re.compile(r"[^@\s]+@acme\.inc")

TrimmedText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


def _normalize_email(value: str) -> str:
    """Trim and lowercase an email so lookups and uniqueness ignore case."""
    return value.strip().lower()


class RegisterRequest(BaseModel):
    """New employee account. The role is always 'employee'; admins promote users later."""

    email: Annotated[str, StringConstraints(max_length=254)]
    full_name: Annotated[TrimmedText, StringConstraints(max_length=100)]
    phone_number: Annotated[TrimmedText, StringConstraints(max_length=30)] | None = None
    password: Annotated[str, StringConstraints(min_length=8, max_length=128)]

    @field_validator("email")
    @classmethod
    def email_must_be_acme(cls, value: str) -> str:
        """Only company addresses can register."""
        email = _normalize_email(value)
        if not ACME_EMAIL.fullmatch(email):
            raise ValueError("Email must be an @acme.inc address")
        return email


class LoginRequest(BaseModel):
    """Email and password. No domain check here: an unknown email is just a failed login."""

    email: Annotated[str, StringConstraints(max_length=254)]
    password: Annotated[str, StringConstraints(max_length=128)]

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        """Match how emails were stored at registration."""
        return _normalize_email(value)


class UserResponse(BaseModel):
    """A user as the API returns it. Never includes the password hash."""

    user_id: int
    email: str
    full_name: str
    phone_number: str | None
    role: Role
    created_at: datetime
