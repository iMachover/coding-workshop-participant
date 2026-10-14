"""Response models for the admin's Audit activity and Archives pages (ADMIN.md §6.4, §6.5)."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AuditRow(BaseModel):
    """One audit log row with the actor's name, as the Audit activity table shows it."""

    id: int
    created_at: datetime
    actor_id: int
    actor_name: str
    actor_role: str
    action: str
    entity_type: str
    entity_id: int
    entity_code: str | None = None
    summary: str


class FieldChange(BaseModel):
    """One field of the before / after diff."""

    field: str
    before: Any = None
    after: Any = None


class AuditDetail(AuditRow):
    """GET /audit/{id}: the row plus its stored details and the diff laid out per field."""

    details: dict[str, Any]
    changes: list[FieldChange]


class ActorOption(BaseModel):
    """A person who has written at least one audit row."""

    id: int
    name: str


class AuditPage(BaseModel):
    """GET /audit: one page, newest first, plus the values the filters can take."""

    items: list[AuditRow]
    page: int
    limit: int
    total: int
    actions: list[str]
    entity_types: list[str]
    actors: list[ActorOption]


class ArchivedRecord(BaseModel):
    """An archived project or user."""

    type: str
    id: int
    code: str
    name: str
    detail: str
    archived_at: datetime
    archived_by: str | None = None


class ArchivesPage(BaseModel):
    """GET /archives: archived projects and users together, newest first."""

    items: list[ArchivedRecord]
    page: int
    limit: int
    total: int
    projects: int
    users: int
