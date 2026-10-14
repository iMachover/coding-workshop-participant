"""
Audit activity and Archives (ADMIN.md §2, §6.4, §6.5). Read-only: the audit log is
append-only and restoring a record goes through the project and user endpoints.
"""

from datetime import date
from typing import Any

import psycopg

from app.audit import repository as repo
from app.audit.schemas import ActorOption, ArchivedRecord, ArchivesPage, AuditDetail, AuditPage, AuditRow, FieldChange
from app.core.errors import AppError


def list_audit(
    conn: psycopg.Connection,
    *,
    query: str | None = None,
    action: str | None = None,
    entity_type: str | None = None,
    actor_id: int | None = None,
    from_: date | None = None,
    to: date | None = None,
    page: int = 1,
    limit: int = 25,
) -> AuditPage:
    """One page of the audit log, newest first, with the filter values."""
    if from_ and to and to < from_:
        raise AppError(400, "VALIDATION_ERROR", "Request validation failed", {"to": "The end date must be on or after the start date"})
    rows, total = repo.page(
        conn, query=query, action=action, entity_type=entity_type, actor_id=actor_id, from_=from_, to=to, page=page, limit=limit
    )
    values = repo.filter_values(conn)
    return AuditPage(
        items=[AuditRow(**r) for r in rows],
        page=page,
        limit=limit,
        total=total,
        actions=values["actions"],
        entity_types=values["entity_types"],
        actors=[ActorOption(**a) for a in values["actors"]],
    )


def _changes(details: dict[str, Any]) -> list[FieldChange]:
    """Lay the stored {before, after} out per field, so the page can show a two-column diff."""
    before = details.get("before") if isinstance(details.get("before"), dict) else {}
    after = details.get("after") if isinstance(details.get("after"), dict) else {}
    fields = list(dict.fromkeys([*after.keys(), *before.keys()]))
    return [FieldChange(field=f, before=before.get(f), after=after.get(f)) for f in fields]


def get_entry(conn: psycopg.Connection, entry_id: int) -> AuditDetail:
    """One audit row with its details and diff."""
    row = repo.entry(conn, entry_id)
    if row is None:
        raise AppError(404, "NOT_FOUND", "Audit entry not found")
    details = row["details"] or {}
    return AuditDetail(**{k: v for k, v in row.items() if k != "details"}, details=details, changes=_changes(details))


def list_archives(conn: psycopg.Connection, *, query: str | None = None, record_type: str | None = None, page: int = 1, limit: int = 25) -> ArchivesPage:
    """Archived projects and users together, newest archive first."""
    rows, total, counts = repo.archives(conn, query=query, record_type=record_type, page=page, limit=limit)
    return ArchivesPage(items=[ArchivedRecord(**r) for r in rows], page=page, limit=limit, total=total, projects=counts["projects"], users=counts["users"])
