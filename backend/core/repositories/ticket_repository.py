"""SQL for the tickets, ticket_notes and ticket_status_history tables."""

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
            t.urgency, t.affected_scope, t.escalation_requested,
            t.building_id, b.building_name, t.floor_id, f.floor_number,
            t.seat_id, s.seat_number, t.created_at, t.updated_at
        FROM tickets t
        JOIN buildings b ON b.building_id = t.building_id
        LEFT JOIN floors f ON f.floor_id = t.floor_id
        LEFT JOIN seats s ON s.seat_id = t.seat_id
        WHERE t.created_by_user_id = %(user_id)s
          AND (%(status)s::text IS NULL OR t.status = %(status)s)
          AND (%(urgency)s::text IS NULL OR t.urgency = %(urgency)s)
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
            "closed": closed,
            "search": search,
            "pattern": _like_pattern(search) if search else None,
        },
    ).fetchall()


def get_detail(conn: psycopg.Connection, ticket_id: int) -> dict[str, Any] | None:
    """Return one ticket with location names and the assigned engineer's name, or None.

    Employee-facing: leaves out the internal priority column.
    """
    return conn.execute(
        """
        SELECT
            t.ticket_id, t.title, t.short_description, t.description, t.category,
            t.urgency, t.affected_scope, t.status, t.building_id,
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


def lock(conn: psycopg.Connection, ticket_id: int) -> None:
    """Lock a ticket row until the transaction ends, so its status can't change mid-update."""
    conn.execute("SELECT 1 FROM tickets WHERE ticket_id = %s FOR UPDATE", (ticket_id,))


def touch(conn: psycopg.Connection, ticket_id: int) -> None:
    """Set a ticket's updated_at to now."""
    conn.execute("UPDATE tickets SET updated_at = now() WHERE ticket_id = %s", (ticket_id,))


def request_escalation(conn: psycopg.Connection, ticket_id: int, reason: str) -> None:
    """Flag a ticket for admin review with the employee's reason."""
    conn.execute(
        """
        UPDATE tickets
        SET escalation_requested = true, escalation_reason = %s, updated_at = now()
        WHERE ticket_id = %s
        """,
        (reason, ticket_id),
    )


def list_notes(conn: psycopg.Connection, ticket_id: int) -> list[dict[str, Any]]:
    """Return a ticket's notes with author names, oldest first."""
    return conn.execute(
        """
        SELECT n.note_id, n.ticket_id, n.user_id, u.full_name AS author_name,
               u.role AS author_role, n.note_text, n.created_at
        FROM ticket_notes n
        JOIN users u ON u.user_id = n.user_id
        WHERE n.ticket_id = %s
        ORDER BY n.created_at, n.note_id
        """,
        (ticket_id,),
    ).fetchall()


def insert_note(
    conn: psycopg.Connection, ticket_id: int, user_id: int, note_text: str
) -> dict[str, Any]:
    """Insert a note and return it with the author's name and role."""
    return conn.execute(
        """
        WITH n AS (
            INSERT INTO ticket_notes (ticket_id, user_id, note_text)
            VALUES (%s, %s, %s)
            RETURNING note_id, ticket_id, user_id, note_text, created_at
        )
        SELECT n.note_id, n.ticket_id, n.user_id, u.full_name AS author_name,
               u.role AS author_role, n.note_text, n.created_at
        FROM n
        JOIN users u ON u.user_id = n.user_id
        """,
        (ticket_id, user_id, note_text),
    ).fetchone()


def list_status_history(conn: psycopg.Connection, ticket_id: int) -> list[dict[str, Any]]:
    """Return every status a ticket has been in, with who changed it, oldest first."""
    return conn.execute(
        """
        SELECT h.history_id, h.ticket_id, h.from_status, h.to_status,
               h.changed_by_user_id, u.full_name AS changed_by_name,
               u.role AS changed_by_role, h.reason, h.changed_at
        FROM ticket_status_history h
        JOIN users u ON u.user_id = h.changed_by_user_id
        WHERE h.ticket_id = %s
        ORDER BY h.changed_at, h.history_id
        """,
        (ticket_id,),
    ).fetchall()


def insert_status_change(
    conn: psycopg.Connection,
    ticket_id: int,
    *,
    from_status: str | None,
    to_status: str,
    changed_by_user_id: int,
    reason: str | None = None,
) -> None:
    """Append one row to a ticket's status history. from_status is None only at creation."""
    conn.execute(
        """
        INSERT INTO ticket_status_history
            (ticket_id, from_status, to_status, changed_by_user_id, reason)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (ticket_id, from_status, to_status, changed_by_user_id, reason),
    )


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
    """Insert a ticket (status defaults to 'open') and return it, without the internal priority."""
    return conn.execute(
        """
        INSERT INTO tickets (
            title, short_description, description, category, urgency,
            affected_scope, priority, building_id, floor_id, seat_id, created_by_user_id
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING
            ticket_id, title, short_description, description, category, urgency,
            affected_scope, status, building_id, floor_id, seat_id,
            created_by_user_id, assigned_to_user_id, escalation_requested,
            escalation_reason, blocked_reason, created_at, updated_at,
            acknowledged_at, assigned_at, resolved_at
        """,
        (
            title, short_description, description, category, urgency,
            affected_scope, priority, building_id, floor_id, seat_id, created_by_user_id,
        ),
    ).fetchone()
