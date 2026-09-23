"""SQL for the users table. Every query returns the role by name, joined from roles."""

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
