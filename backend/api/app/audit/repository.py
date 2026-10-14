"""SQL for reading the audit log and the archived records. Read-only."""

from datetime import date
from typing import Any

import psycopg

_ROW = """
    SELECT a.id, a.created_at, a.actor_user_id AS actor_id,
           u.first_name || ' ' || u.last_name AS actor_name, u.role::text AS actor_role,
           a.action, a.entity_type, a.entity_id, a.entity_code, a.summary
    FROM audit_log a
    JOIN users u ON u.id = a.actor_user_id
"""

_FILTERS = """
    WHERE (%(action)s::text IS NULL OR a.action = %(action)s)
      AND (%(entity_type)s::text IS NULL OR a.entity_type = %(entity_type)s)
      AND (%(actor_id)s::bigint IS NULL OR a.actor_user_id = %(actor_id)s)
      AND (%(from)s::date IS NULL OR a.created_at >= %(from)s::date)
      AND (%(to)s::date IS NULL OR a.created_at < %(to)s::date + 1)
      AND (%(query)s::text IS NULL
           OR a.summary ILIKE %(query)s OR a.entity_code ILIKE %(query)s
           OR (u.first_name || ' ' || u.last_name) ILIKE %(query)s)
"""


def _params(query, action, entity_type, actor_id, from_, to) -> dict[str, Any]:
    return {
        "query": f"%{query.strip()}%" if query and query.strip() else None,
        "action": action,
        "entity_type": entity_type,
        "actor_id": actor_id,
        "from": from_,
        "to": to,
    }


def page(
    conn: psycopg.Connection,
    *,
    query: str | None,
    action: str | None,
    entity_type: str | None,
    actor_id: int | None,
    from_: date | None,
    to: date | None,
    page: int,
    limit: int,
) -> tuple[list[dict[str, Any]], int]:
    """One page of audit rows matching the filters, newest first, and the total match count."""
    params = _params(query, action, entity_type, actor_id, from_, to)
    with conn.cursor() as cur:
        cur.execute(
            _ROW + _FILTERS + " ORDER BY a.created_at DESC, a.id DESC LIMIT %(limit)s OFFSET %(offset)s",  # nosec B608 - fixed fragments
            {**params, "limit": limit, "offset": (page - 1) * limit},
        )
        rows = cur.fetchall()
        cur.execute("SELECT count(*) AS n FROM audit_log a JOIN users u ON u.id = a.actor_user_id" + _FILTERS, params)  # nosec B608
        total = cur.fetchone()["n"]
    return rows, total


def entry(conn: psycopg.Connection, entry_id: int) -> dict[str, Any] | None:
    """One audit row with its details, or None."""
    with conn.cursor() as cur:
        cur.execute(_ROW.replace("a.summary", "a.summary, a.details") + " WHERE a.id = %s", (entry_id,))  # nosec B608
        return cur.fetchone()


def filter_values(conn: psycopg.Connection) -> dict[str, Any]:
    """Every action and entity type ever recorded, and every actor, for the filter dropdowns."""
    with conn.cursor() as cur:
        cur.execute("SELECT DISTINCT action FROM audit_log ORDER BY action")
        actions = [r["action"] for r in cur.fetchall()]
        cur.execute("SELECT DISTINCT entity_type FROM audit_log ORDER BY entity_type")
        entity_types = [r["entity_type"] for r in cur.fetchall()]
        cur.execute(
            """
            SELECT DISTINCT u.id, u.first_name || ' ' || u.last_name AS name
            FROM audit_log a JOIN users u ON u.id = a.actor_user_id
            ORDER BY name
            """
        )
        actors = cur.fetchall()
    return {"actions": actions, "entity_types": entity_types, "actors": actors}


def archives(conn: psycopg.Connection, *, query: str | None, record_type: str | None, page: int, limit: int) -> tuple[list[dict[str, Any]], int, dict[str, int]]:
    """Archived projects and users as one list, newest archive first, with the total and per-type counts."""
    params = {
        "query": f"%{query.strip()}%" if query and query.strip() else None,
        "type": record_type,
        "limit": limit,
        "offset": (page - 1) * limit,
    }
    union = """
        WITH archived AS (
            SELECT 'project' AS type, p.id, p.code, p.name,
                   d.department_name || ' · ' || mu.first_name || ' ' || mu.last_name AS detail,
                   coalesce(la.created_at, p.updated_at) AS archived_at, la.actor_name AS archived_by
            FROM projects p
            JOIN departments d ON d.id = p.department_id
            JOIN users mu ON mu.id = p.manager_id
            LEFT JOIN LATERAL (
                SELECT a.created_at, u.first_name || ' ' || u.last_name AS actor_name
                FROM audit_log a JOIN users u ON u.id = a.actor_user_id
                WHERE a.entity_type = 'project' AND a.entity_id = p.id AND a.action = 'archived'
                ORDER BY a.created_at DESC LIMIT 1
            ) la ON TRUE
            WHERE p.is_archived
            UNION ALL
            SELECT 'user' AS type, us.id, 'USR-' || lpad(us.id::text, 3, '0') AS code,
                   us.first_name || ' ' || us.last_name AS name,
                   initcap(us.role::text) || ' · ' || us.email AS detail,
                   coalesce(la.created_at, us.updated_at) AS archived_at, la.actor_name AS archived_by
            FROM users us
            LEFT JOIN LATERAL (
                SELECT a.created_at, u.first_name || ' ' || u.last_name AS actor_name
                FROM audit_log a JOIN users u ON u.id = a.actor_user_id
                WHERE a.entity_type = 'user' AND a.entity_id = us.id AND a.action = 'archived'
                ORDER BY a.created_at DESC LIMIT 1
            ) la ON TRUE
            WHERE us.is_archived
        )
    """
    where = """
        WHERE (%(type)s::text IS NULL OR type = %(type)s)
          AND (%(query)s::text IS NULL OR code ILIKE %(query)s OR name ILIKE %(query)s OR detail ILIKE %(query)s)
    """
    with conn.cursor() as cur:
        cur.execute(union + "SELECT * FROM archived" + where + " ORDER BY archived_at DESC, code LIMIT %(limit)s OFFSET %(offset)s", params)  # nosec B608
        rows = cur.fetchall()
        cur.execute(union + "SELECT count(*) AS n FROM archived" + where, params)  # nosec B608
        total = cur.fetchone()["n"]
        cur.execute(
            """
            SELECT (SELECT count(*) FROM projects WHERE is_archived) AS projects,
                   (SELECT count(*) FROM users WHERE is_archived) AS users
            """
        )
        counts = cur.fetchone()
    return rows, total, counts
