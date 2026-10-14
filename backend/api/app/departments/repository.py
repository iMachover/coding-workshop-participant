"""SQL for departments. Business rules live in the service."""

from typing import Any

import psycopg

_SELECT = """
    SELECT d.id, d.department_name AS name, d.prefix, d.next_project_seq,
           (SELECT count(*) FROM users u WHERE u.department_id = d.id AND NOT u.is_archived) AS people,
           (SELECT count(*) FROM projects p WHERE p.department_id = d.id AND p.status = 'active' AND NOT p.is_archived) AS active_projects
    FROM departments d
"""


def list_all(conn: psycopg.Connection) -> list[dict[str, Any]]:
    """Every department with its people and active project counts, by name."""
    with conn.cursor() as cur:
        cur.execute(_SELECT + " ORDER BY d.department_name")  # nosec B608 - fixed fragment
        return cur.fetchall()


def find(conn: psycopg.Connection, department_id: int) -> dict[str, Any] | None:
    """One department, or None."""
    with conn.cursor() as cur:
        cur.execute(_SELECT + " WHERE d.id = %s", (department_id,))  # nosec B608
        return cur.fetchone()


def name_taken(conn: psycopg.Connection, name: str, exclude_id: int | None = None) -> bool:
    """True if another department already has this name (case-insensitive)."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT 1 FROM departments WHERE lower(department_name) = lower(%s) AND (%s::bigint IS NULL OR id <> %s)",
            (name, exclude_id, exclude_id),
        )
        return cur.fetchone() is not None


def prefix_taken(conn: psycopg.Connection, prefix: str, exclude_id: int | None = None) -> bool:
    """True if another department already uses this prefix."""
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM departments WHERE prefix = %s AND (%s::bigint IS NULL OR id <> %s)", (prefix, exclude_id, exclude_id))
        return cur.fetchone() is not None


def insert(conn: psycopg.Connection, name: str, prefix: str) -> int:
    """Create a department and return its id."""
    with conn.cursor() as cur:
        cur.execute("INSERT INTO departments (department_name, prefix) VALUES (%s, %s) RETURNING id", (name, prefix))
        return cur.fetchone()["id"]


def update(conn: psycopg.Connection, department_id: int, fields: dict[str, Any]) -> None:
    """Set the name and / or prefix of a department."""
    columns = {"name": "department_name", "prefix": "prefix"}
    assignments = ", ".join(f"{columns[k]} = %({k})s" for k in fields)
    if not assignments:
        return
    with conn.cursor() as cur:
        cur.execute(f"UPDATE departments SET {assignments} WHERE id = %(id)s", {**fields, "id": department_id})  # nosec B608 - fixed column names
