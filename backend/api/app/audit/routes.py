"""HTTP routes for the admin's Audit activity and Archives. Read-only; restore lives with projects and users."""

from datetime import date
from typing import Any

import psycopg
from fastapi import APIRouter, Depends, Query

from app.audit import service
from app.audit.schemas import ArchivesPage, AuditDetail, AuditPage
from app.core.deps import require_roles
from app.db.connection import get_db

router = APIRouter(tags=["audit"])

Admin = Depends(require_roles("admin"))


@router.get("/audit", response_model=AuditPage)
def list_audit(
    _admin: dict[str, Any] = Admin,
    q: str | None = Query(default=None, max_length=100),
    action: str | None = Query(default=None, max_length=40),
    entity_type: str | None = Query(default=None, max_length=40),
    actor_id: int | None = None,
    start: date | None = Query(default=None, alias="from"),
    end: date | None = Query(default=None, alias="to"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=25, ge=1, le=100),
    db: psycopg.Connection = Depends(get_db),
) -> AuditPage:
    """The audit log, newest first: search actor, record code or summary; filter by action, entity, actor, dates."""
    return service.list_audit(db, query=q, action=action, entity_type=entity_type, actor_id=actor_id, from_=start, to=end, page=page, limit=limit)


@router.get("/audit/{entry_id}", response_model=AuditDetail)
def read_audit_entry(entry_id: int, _admin: dict[str, Any] = Admin, db: psycopg.Connection = Depends(get_db)) -> AuditDetail:
    """One entry with its before / after details."""
    return service.get_entry(db, entry_id)


@router.get("/archives", response_model=ArchivesPage)
def list_archives(
    _admin: dict[str, Any] = Admin,
    q: str | None = Query(default=None, max_length=100),
    type: str | None = Query(default=None, pattern="^(project|user)$"),  # noqa: A002 - matches ADMIN.md §7
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=25, ge=1, le=100),
    db: psycopg.Connection = Depends(get_db),
) -> ArchivesPage:
    """Archived projects and users, newest archive first. Restore with the project or user restore routes."""
    return service.list_archives(db, query=q, record_type=type, page=page, limit=limit)
