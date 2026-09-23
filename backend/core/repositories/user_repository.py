"""SQL for the users table. User lookups return the role by name, joined from roles."""

from typing import Any

import psycopg


def insert(
    conn: psycopg.Connection,
    email: str,
    full_name: str,
    phone_number: str | None,
    password_hash: str,
) -> dict[str, Any] | None:
    """Insert an employee and return it, or None if the email is already taken."""
    return conn.execute(
        """
        WITH u AS (
            INSERT INTO users (email, full_name, phone_number, password_hash, role_id)
            VALUES (%s, %s, %s, %s, (SELECT role_id FROM roles WHERE role_name = 'employee'))
            ON CONFLICT (email) DO NOTHING
            RETURNING user_id, email, full_name, phone_number, role_id, created_at
        )
        SELECT u.user_id, u.email, u.full_name, u.phone_number, r.role_name AS role,
               u.created_at
        FROM u
        JOIN roles r ON r.role_id = u.role_id
        """,
        (email, full_name, phone_number, password_hash),
    ).fetchone()


def get_by_id(conn: psycopg.Connection, user_id: int) -> dict[str, Any] | None:
    """Return the user with this id, without the password hash, or None."""
    return conn.execute(
        """
        SELECT u.user_id, u.email, u.full_name, u.phone_number, r.role_name AS role,
               u.created_at
        FROM users u
        JOIN roles r ON r.role_id = u.role_id
        WHERE u.user_id = %s
        """,
        (user_id,),
    ).fetchone()


def list_engineers_with_workload(conn: psycopg.Connection) -> list[dict[str, Any]]:
    """Return every engineer with counts of their active tickets, lightest load first.

    Active means open, in progress or blocked. Engineers with no tickets are included (all
    counts 0). Ties go to whoever has fewer P1s, then by name.
    """
    return conn.execute(
        """
        SELECT u.user_id, u.full_name, u.email,
               count(t.ticket_id) AS active_count,
               count(t.ticket_id) FILTER (WHERE t.status = 'open') AS open_count,
               count(t.ticket_id) FILTER (WHERE t.status = 'in_progress') AS in_progress_count,
               count(t.ticket_id) FILTER (WHERE t.status = 'blocked') AS blocked_count,
               count(t.ticket_id) FILTER (WHERE t.priority = 'P1') AS p1_count
        FROM users u
        JOIN roles r ON r.role_id = u.role_id
        LEFT JOIN tickets t
          ON t.assigned_to_user_id = u.user_id
         AND t.status IN ('open', 'in_progress', 'blocked')
        WHERE r.role_name = 'engineer'
        GROUP BY u.user_id
        ORDER BY active_count, p1_count, u.full_name, u.user_id
        """
    ).fetchall()


def get_with_password_hash_by_email(
    conn: psycopg.Connection, email: str
) -> dict[str, Any] | None:
    """Return the user with this email, including password_hash, or None."""
    return conn.execute(
        """
        SELECT u.user_id, u.email, u.full_name, u.phone_number, r.role_name AS role,
               u.created_at, u.password_hash
        FROM users u
        JOIN roles r ON r.role_id = u.role_id
        WHERE u.email = %s
        """,
        (email,),
    ).fetchone()
