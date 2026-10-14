"""Pydantic models for user data returned by the API."""

from pydantic import BaseModel, ConfigDict


class UserPublic(BaseModel):
    """The fields of a user that may be sent to a client. Never the hash."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    first_name: str
    last_name: str
    email: str
    job_title: str | None = None
    role: str
