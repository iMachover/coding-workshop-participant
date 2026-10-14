"""SQL for creating, changing and archiving projects. Reads reuse the overview queries."""

from datetime import date
from typing import Any

import psycopg

_COLUMNS = (
    "id, code, name, description, department_id, manager_id, start_date, end_date, "
    "budget::float8 AS budget, status::text AS status, is_archived"
)


def find_by_id(conn: psycopg.Connection, project_id: int) -> dict[str, Any] | None:
    """The stored project row, archived or not, or None."""
    with conn.cursor() as cur:
        cur.execute(f"SELECT {_COLUMNS} FROM projects WHERE id = %s", (project_id,))  # nosec B608
        return cur.fetchone()


def next_code(conn: psycopg.Connection, department_id: int) -> str | None:
    """Reserve the department's next project code (e.g. INF-025), or None if no such department."""
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE departments SET next_project_seq = next_project_seq + 1
            WHERE id = %s
            RETURNING prefix, next_project_seq - 1 AS seq
            """,
            (department_id,),
        )
        row = cur.fetchone()
        return f"{row['prefix']}-{row['seq']:03d}" if row else None


def insert(
    conn: psycopg.Connection,
    *,
    code: str,
    name: str,
    description: str | None,
    department_id: int,
    manager_id: int,
    start_date: date,
    end_date: date,
    budget: float,
) -> int:
    """Insert a project and return its id."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO projects (code, name, description, department_id, manager_id, start_date, end_date, budget)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (code, name, description, department_id, manager_id, start_date, end_date, budget),
        )
        return cur.fetchone()["id"]


def update(conn: psycopg.Connection, project_id: int, fields: dict[str, Any]) -> None:
    """Set the given columns on a project. `fields` keys are validated by the service."""
    if not fields:
        return
    assignments = ", ".join(f"{column} = %({column})s" for column in fields)
    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE projects SET {assignments}, updated_at = now() WHERE id = %(id)s",  # nosec B608 - column names come from a fixed allow-list
            {**fields, "id": project_id},
        )


def set_archived(conn: psycopg.Connection, project_id: int, archived: bool) -> None:
    """Archive or restore a project."""
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE projects SET is_archived = %s, updated_at = now() WHERE id = %s",
            (archived, project_id),
        )


def employee_figures(conn: psycopg.Connection, user_id: int) -> dict[int, dict[str, float]]:
    """Per project: the user's planned hours (their tasks) and actual hours (their entries)."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT m.project_id,
                   coalesce(sum(t.predicted_hours), 0)::float8 AS planned_hours,
                   coalesce((SELECT sum(te.hours) FROM time_entries te
                             JOIN tasks tt ON tt.id = te.task_id
                             JOIN milestones mm ON mm.id = tt.milestone_id
                             WHERE te.user_id = %(user_id)s AND mm.project_id = m.project_id), 0)::float8 AS actual_hours
            FROM tasks t
            JOIN milestones m ON m.id = t.milestone_id
            WHERE t.assigned_to = %(user_id)s
            GROUP BY m.project_id
            """,
            {"user_id": user_id},
        )
        return {row["project_id"]: row for row in cur.fetchall()}


def manager_options(conn: psycopg.Connection) -> list[dict[str, Any]]:
    """Active managers, for the admin's project form."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, first_name || ' ' || last_name AS name FROM users
            WHERE role = 'manager' AND NOT is_archived ORDER BY last_name, first_name
            """
        )
        return cur.fetchall()


def department_options(conn: psycopg.Connection) -> list[dict[str, Any]]:
    """Every department with its code prefix."""
    with conn.cursor() as cur:
        cur.execute("SELECT id, department_name AS name, prefix FROM departments ORDER BY department_name")
        return cur.fetchall()


def user_role(conn: psycopg.Connection, user_id: int) -> dict[str, Any] | None:
    """A user's role and archived flag, for validating manager assignment."""
    with conn.cursor() as cur:
        cur.execute("SELECT id, role, is_archived FROM users WHERE id = %s", (user_id,))
        return cur.fetchone()
