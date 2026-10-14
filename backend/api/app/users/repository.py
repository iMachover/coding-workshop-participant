"""SQL access for the users table. No business rules live here."""

from typing import Any

import psycopg

# The f-strings below only interpolate this fixed column list; values are always bound parameters.
_COLUMNS = (
    "id, username, password_hash, first_name, last_name, email, "
    "job_title, role, hourly_rate, manager_id, is_archived, created_at, updated_at"
)


def find_by_username(conn: psycopg.Connection, username: str) -> dict[str, Any] | None:
    """Return the user row for a username, or None."""
    with conn.cursor() as cur:
        cur.execute(f"SELECT {_COLUMNS} FROM users WHERE username = %s", (username,))  # nosec B608
        return cur.fetchone()


def list_all(conn: psycopg.Connection) -> list[dict[str, Any]]:
    """Return every user row, including archived ones, ordered by username."""
    with conn.cursor() as cur:
        cur.execute(f"SELECT {_COLUMNS} FROM users ORDER BY username")  # nosec B608
        return cur.fetchall()


def find_by_id(conn: psycopg.Connection, user_id: int) -> dict[str, Any] | None:
    """Return the user row for an id, or None."""
    with conn.cursor() as cur:
        cur.execute(f"SELECT {_COLUMNS} FROM users WHERE id = %s", (user_id,))  # nosec B608
        return cur.fetchone()
