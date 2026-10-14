"""
Append-only audit trail. Every write to the data goes through `record` so the
Audit page (ADMIN.md §6.4) can show who changed what, when, and the before/after.
"""

from typing import Any

import psycopg
from psycopg.types.json import Jsonb


def record(
    conn: psycopg.Connection,
    *,
    actor_id: int,
    action: str,
    entity_type: str,
    entity_id: int,
    entity_code: str | None,
    summary: str,
    details: dict[str, Any] | None = None,
) -> int:
    """Insert one audit row in the caller's transaction and return its id."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, entity_code, summary, details)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (actor_id, action, entity_type, entity_id, entity_code, summary, Jsonb(details or {})),
        )
        return cur.fetchone()["id"]


def changes(before: dict[str, Any], after: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """{"before": {...}, "after": {...}} holding only the fields whose value changed."""
    changed = {k: v for k, v in after.items() if before.get(k) != v}
    return {"before": {k: before.get(k) for k in changed}, "after": changed}
