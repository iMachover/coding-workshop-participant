"""SQL for time entries. Business rules live in the service."""

from datetime import date
from typing import Any

import psycopg

_ENTRY_SELECT = """
    SELECT te.id, te.work_date, te.hours::float8 AS hours, te.note, te.user_id, te.created_at,
           (te.hours * u.hourly_rate)::float8 AS cost,
           u.first_name || ' ' || u.last_name AS user_name,
           t.id AS task_id, t.code AS task_code, t.title AS task_title, t.status::text AS task_status,
           p.id AS project_id, p.code AS project_code, p.name AS project_name,
           p.manager_id, p.status::text AS project_status, p.is_archived
    FROM time_entries te
    JOIN users u ON u.id = te.user_id
    JOIN tasks t ON t.id = te.task_id
    JOIN milestones m ON m.id = t.milestone_id
    JOIN projects p ON p.id = m.project_id
"""


def entry(conn: psycopg.Connection, entry_id: int) -> dict[str, Any] | None:
    """One entry with its task and project, or None."""
    with conn.cursor() as cur:
        cur.execute(_ENTRY_SELECT + " WHERE te.id = %s", (entry_id,))  # nosec B608 - fixed fragment
        return cur.fetchone()


def entries_of_user(conn: psycopg.Connection, user_id: int, start: date, end: date) -> list[dict[str, Any]]:
    """A person's entries between two dates (inclusive), newest day first."""
    with conn.cursor() as cur:
        cur.execute(
            _ENTRY_SELECT + " WHERE te.user_id = %s AND te.work_date BETWEEN %s AND %s ORDER BY te.work_date DESC, te.id DESC",  # nosec B608
            (user_id, start, end),
        )
        return cur.fetchall()


def entries_of_task(conn: psycopg.Connection, task_id: int, user_id: int | None = None) -> list[dict[str, Any]]:
    """Every entry on a task, or only one person's, newest day first."""
    with conn.cursor() as cur:
        cur.execute(
            _ENTRY_SELECT
            + " WHERE te.task_id = %(task_id)s AND (%(user_id)s::bigint IS NULL OR te.user_id = %(user_id)s)"
            + " ORDER BY te.work_date DESC, te.id DESC",  # nosec B608
            {"task_id": task_id, "user_id": user_id},
        )
        return cur.fetchall()


def hours_on_day(conn: psycopg.Connection, user_id: int, day: date, exclude_id: int | None = None) -> float:
    """How many hours the person already logged on a day (optionally ignoring one entry)."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT coalesce(sum(hours), 0)::float8 AS hours FROM time_entries
            WHERE user_id = %s AND work_date = %s AND (%s::bigint IS NULL OR id <> %s)
            """,
            (user_id, day, exclude_id, exclude_id),
        )
        return cur.fetchone()["hours"]


def loggable_tasks(conn: psycopg.Connection, user_id: int) -> list[dict[str, Any]]:
    """The person's tasks that may receive hours: in progress or submitted, on an active project."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT t.id, t.code, t.title, t.status::text AS status, p.code AS project_code, p.name AS project_name
            FROM tasks t
            JOIN milestones m ON m.id = t.milestone_id
            JOIN projects p ON p.id = m.project_id
            WHERE t.assigned_to = %s AND t.status IN ('in_progress', 'submitted')
              AND p.status = 'active' AND NOT p.is_archived
            ORDER BY t.status, t.due_date NULLS LAST, t.code
            """,
            (user_id,),
        )
        return cur.fetchall()


def insert(conn: psycopg.Connection, task_id: int, user_id: int, work_date: date, hours: float, note: str | None) -> int:
    """Insert an entry and return its id."""
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO time_entries (task_id, user_id, work_date, hours, note) VALUES (%s, %s, %s, %s, %s) RETURNING id",
            (task_id, user_id, work_date, hours, note),
        )
        return cur.fetchone()["id"]


def update(conn: psycopg.Connection, entry_id: int, fields: dict[str, Any]) -> None:
    """Set the given columns on an entry. `fields` keys come from TimeEntryUpdate."""
    if not fields:
        return
    assignments = ", ".join(f"{column} = %({column})s" for column in fields)
    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE time_entries SET {assignments}, updated_at = now() WHERE id = %(id)s",  # nosec B608 - fixed column names
            {**fields, "id": entry_id},
        )


def delete(conn: psycopg.Connection, entry_id: int) -> None:
    """Remove an entry."""
    with conn.cursor() as cur:
        cur.execute("DELETE FROM time_entries WHERE id = %s", (entry_id,))
