"""SQL for the tickets and ticket_notes tables."""

from typing import Any

import psycopg


def _like_pattern(text: str) -> str:
    """Wrap text for a 'contains' ILIKE, escaping % and _ so they match literally."""
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def list_for_creator(
    conn: psycopg.Connection,
    user_id: int,
    *,
    status: str | None,
    urgency: str | None,
    priority: str | None,
    closed: bool | None,
    search: str | None,
) -> list[dict[str, Any]]:
    """Return one user's tickets with location names, most recently updated first.

    Each filter is skipped when its value is None, so the SQL text never changes.
    """
    return conn.execute(
        """
        SELECT
            t.ticket_id, t.title, t.short_description, t.category, t.status,
            t.urgency, t.priority, t.affected_scope, t.escalation_requested,
            t.building_id, b.building_name, t.floor_id, f.floor_number,
            t.seat_id, s.seat_number, t.created_at, t.updated_at
        FROM tickets t
        JOIN buildings b ON b.building_id = t.building_id
        LEFT JOIN floors f ON f.floor_id = t.floor_id
        LEFT JOIN seats s ON s.seat_id = t.seat_id
        WHERE t.created_by_user_id = %(user_id)s
          AND (%(status)s::text IS NULL OR t.status = %(status)s)
          AND (%(urgency)s::text IS NULL OR t.urgency = %(urgency)s)
          AND (%(priority)s::text IS NULL OR t.priority = %(priority)s)
          AND (%(closed)s::boolean IS NULL OR (t.status = 'closed') = %(closed)s)
          AND (%(search)s::text IS NULL
               OR t.title ILIKE %(pattern)s
               OR t.short_description ILIKE %(pattern)s
               OR t.ticket_id::text = %(search)s)
        ORDER BY t.updated_at DESC, t.ticket_id DESC
        """,
        {
            "user_id": user_id,
            "status": status,
            "urgency": urgency,
            "priority": priority,
            "closed": closed,
            "search": search,
            "pattern": _like_pattern(search) if search else None,
        },
    ).fetchall()


def get_detail(conn: psycopg.Connection, ticket_id: int) -> dict[str, Any] | None:
    """Return one ticket with location names and the assigned engineer's name, or None."""
    return conn.execute(
        """
        SELECT
            t.ticket_id, t.title, t.short_description, t.description, t.category,
            t.urgency, t.affected_scope, t.priority, t.status, t.building_id,
            t.floor_id, t.seat_id, t.created_by_user_id, t.assigned_to_user_id,
            t.escalation_requested, t.escalation_reason, t.blocked_reason,
            t.created_at, t.updated_at, t.acknowledged_at, t.assigned_at, t.resolved_at,
            b.building_name, f.floor_number, s.seat_number,
            engineer.full_name AS assigned_to_name
        FROM tickets t
        JOIN buildings b ON b.building_id = t.building_id
        LEFT JOIN floors f ON f.floor_id = t.floor_id
        LEFT JOIN seats s ON s.seat_id = t.seat_id
        LEFT JOIN users engineer ON engineer.user_id = t.assigned_to_user_id
        WHERE t.ticket_id = %s
        """,
        (ticket_id,),
    ).fetchone()


def insert(
    conn: psycopg.Connection,
    *,
    title: str,
    short_description: str,
    description: str,
    category: str,
    urgency: str,
    affected_scope: str,
    priority: str,
    building_id: int,
    floor_id: int | None,
    seat_id: int | None,
    created_by_user_id: int,
) -> dict[str, Any]:
    """Insert a ticket (status defaults to 'open') and return the stored row."""
    return conn.execute(
        """
        INSERT INTO tickets (
            title, short_description, description, category, urgency,
            affected_scope, priority, building_id, floor_id, seat_id, created_by_user_id
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING
            ticket_id, title, short_description, description, category, urgency,
            affected_scope, priority, status, building_id, floor_id, seat_id,
            created_by_user_id, assigned_to_user_id, escalation_requested,
            escalation_reason, blocked_reason, created_at, updated_at,
            acknowledged_at, assigned_at, resolved_at
        """,
        (
            title, short_description, description, category, urgency,
            affected_scope, priority, building_id, floor_id, seat_id, created_by_user_id,
        ),
    ).fetchone()
