"""SQL for the users table."""

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
        INSERT INTO users (email, full_name, phone_number, password_hash)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (email) DO NOTHING
        RETURNING user_id, email, full_name, phone_number, role, created_at
        """,
        (email, full_name, phone_number, password_hash),
    ).fetchone()


def get_by_id(conn: psycopg.Connection, user_id: int) -> dict[str, Any] | None:
    """Return the user with this id, without the password hash, or None."""
    return conn.execute(
        """
        SELECT user_id, email, full_name, phone_number, role, created_at
        FROM users
        WHERE user_id = %s
        """,
        (user_id,),
    ).fetchone()


def get_with_password_hash_by_email(
    conn: psycopg.Connection, email: str
) -> dict[str, Any] | None:
    """Return the user with this email, including password_hash, or None."""
    return conn.execute(
        """
        SELECT user_id, email, full_name, phone_number, role, created_at, password_hash
        FROM users
        WHERE email = %s
        """,
        (email,),
    ).fetchone()
