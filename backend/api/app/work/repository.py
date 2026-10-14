"""SQL for milestones, tasks and notes. Business rules live in the service."""

from datetime import UTC, date, datetime
from typing import Any

import psycopg

from app.overview.repository import _MILESTONE_LOCKED

_TASK_SELECT = f"""
    SELECT t.id, t.code, t.title, t.description, t.status::text AS status, t.due_date,
           t.started_at, t.submitted_at, t.completed_at,
           t.predicted_hours::float8 AS planned_hours,
           t.assigned_to AS assignee_id,
           au.first_name || ' ' || au.last_name AS assignee_name,
           au.hourly_rate::float8 AS assignee_rate,
           m.id AS milestone_id, m.name AS milestone_name, m.status::text AS milestone_status,
           m.sequence AS milestone_sequence,
           {_MILESTONE_LOCKED} AS milestone_locked,
           p.id AS project_id, p.code AS project_code, p.name AS project_name,
           p.manager_id, p.status::text AS project_status, p.is_archived,
           mu.first_name || ' ' || mu.last_name AS manager_name,
           coalesce((SELECT sum(te.hours) FROM time_entries te WHERE te.task_id = t.id), 0)::float8 AS actual_hours,
           coalesce((SELECT sum(te.hours * eu.hourly_rate) FROM time_entries te
                     JOIN users eu ON eu.id = te.user_id WHERE te.task_id = t.id), 0)::float8 AS actual_labour,
           coalesce((SELECT sum(r.estimated_cost) FROM task_resources r WHERE r.task_id = t.id), 0)::float8 AS planned_resources,
           coalesce((SELECT sum(r.actual_cost) FROM task_resources r WHERE r.task_id = t.id), 0)::float8 AS actual_resources
    FROM tasks t
    JOIN users au ON au.id = t.assigned_to
    JOIN milestones m ON m.id = t.milestone_id
    JOIN projects p ON p.id = m.project_id
    JOIN users mu ON mu.id = p.manager_id
"""  # nosec B608 - only interpolates the fixed _MILESTONE_LOCKED fragment


def task(conn: psycopg.Connection, task_id: int) -> dict[str, Any] | None:
    """One task with its milestone, project and figures, or None."""
    with conn.cursor() as cur:
        cur.execute(_TASK_SELECT + " WHERE t.id = %s", (task_id,))  # nosec B608
        return cur.fetchone()


def milestone_tasks(conn: psycopg.Connection, milestone_id: int, assignee_id: int | None = None) -> list[dict[str, Any]]:
    """Tasks in a milestone, optionally only one person's, in due-date order."""
    with conn.cursor() as cur:
        cur.execute(
            _TASK_SELECT
            + " WHERE m.id = %(milestone_id)s AND (%(assignee)s::bigint IS NULL OR t.assigned_to = %(assignee)s)"
            + " ORDER BY t.due_date NULLS LAST, t.code",  # nosec B608
            {"milestone_id": milestone_id, "assignee": assignee_id},
        )
        return cur.fetchall()


def task_resources(conn: psycopg.Connection, task_id: int) -> list[dict[str, Any]]:
    """Resources attached to a task."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, name, quantity, estimated_cost::float8 AS estimated_cost, actual_cost::float8 AS actual_cost
            FROM task_resources WHERE task_id = %s ORDER BY id
            """,
            (task_id,),
        )
        return cur.fetchall()


def active_milestone_of(conn: psycopg.Connection, user_id: int) -> dict[str, Any] | None:
    """The milestone holding the user's in-progress work, if any."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT m.id, m.name, p.code AS project_code FROM tasks t
            JOIN milestones m ON m.id = t.milestone_id
            JOIN projects p ON p.id = m.project_id
            WHERE t.assigned_to = %s AND t.status = 'in_progress' AND NOT p.is_archived
            ORDER BY t.started_at LIMIT 1
            """,
            (user_id,),
        )
        return cur.fetchone()


def set_task_status(conn: psycopg.Connection, task_id: int, status: str, stamps: dict[str, Any]) -> None:
    """Change a task's status and its timestamp columns (`stamps` maps column -> value/None)."""
    assignments = ", ".join(f"{column} = %({column})s" for column in stamps)
    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE tasks SET status = %(status)s, {assignments}, updated_at = now() WHERE id = %(id)s",  # nosec B608 - fixed column names
            {**stamps, "status": status, "id": task_id},
        )


def set_milestone_status(conn: psycopg.Connection, milestone_id: int, status: str, completed: bool | None = None) -> None:
    """Change a milestone's status; `completed` stamps or clears completed_at."""
    with conn.cursor() as cur:
        if completed is None:
            cur.execute("UPDATE milestones SET status = %s, updated_at = now() WHERE id = %s", (status, milestone_id))
        elif completed:
            cur.execute("UPDATE milestones SET status = %s, completed_at = now(), updated_at = now() WHERE id = %s", (status, milestone_id))
        else:
            cur.execute("UPDATE milestones SET status = %s, completed_at = NULL, updated_at = now() WHERE id = %s", (status, milestone_id))


def milestone(conn: psycopg.Connection, milestone_id: int) -> dict[str, Any] | None:
    """One milestone with its project, lock state and task counts, or None."""
    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT m.id, m.project_id, m.sequence, m.name, m.description, m.status::text AS status,
                   m.start_date, m.projected_end_date, m.completed_at,
                   m.predicted_hours::float8 AS predicted_hours,
                   {_MILESTONE_LOCKED} AS locked,
                   p.code AS project_code, p.name AS project_name, p.manager_id,
                   p.status::text AS project_status, p.is_archived,
                   (SELECT count(*) FROM tasks t WHERE t.milestone_id = m.id) AS tasks_total,
                   (SELECT count(*) FROM tasks t WHERE t.milestone_id = m.id AND t.status = 'completed') AS tasks_completed
            FROM milestones m
            JOIN projects p ON p.id = m.project_id
            WHERE m.id = %s
            """,  # nosec B608 - only interpolates the fixed _MILESTONE_LOCKED fragment
            (milestone_id,),
        )
        return cur.fetchone()


def insert_milestone(conn: psycopg.Connection, project_id: int, data: dict[str, Any]) -> dict[str, Any]:
    """Append a milestone after the project's last one. Returns id and sequence."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO milestones (project_id, name, description, sequence, start_date, projected_end_date, predicted_hours)
            VALUES (%(project_id)s, %(name)s, %(description)s,
                    (SELECT coalesce(max(sequence), 0) + 1 FROM milestones WHERE project_id = %(project_id)s),
                    %(start_date)s, %(projected_end_date)s, %(predicted_hours)s)
            RETURNING id, sequence
            """,
            {"project_id": project_id, **data},
        )
        return cur.fetchone()


def insert_task(conn: psycopg.Connection, milestone_id: int, data: dict[str, Any]) -> dict[str, Any]:
    """Insert a task with the next TSK-### code. Returns id and code."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO tasks (code, milestone_id, assigned_to, title, description, predicted_hours, due_date)
            VALUES ('TSK-' || lpad(nextval('task_code_seq')::text, 3, '0'), %(milestone_id)s, %(assigned_to)s,
                    %(title)s, %(description)s, %(predicted_hours)s, %(due_date)s)
            RETURNING id, code
            """,
            {"milestone_id": milestone_id, **data},
        )
        return cur.fetchone()


def is_on_project(conn: psycopg.Connection, user_id: int, project_id: int) -> bool:
    """True if the user is on a team attached to the project or has a task in it."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT EXISTS (
                SELECT 1 FROM project_teams pt JOIN team_members mem ON mem.team_id = pt.team_id
                WHERE pt.project_id = %(project_id)s AND mem.user_id = %(user_id)s
            ) OR EXISTS (
                SELECT 1 FROM tasks t JOIN milestones m ON m.id = t.milestone_id
                WHERE m.project_id = %(project_id)s AND t.assigned_to = %(user_id)s
            ) AS ok
            """,
            {"project_id": project_id, "user_id": user_id},
        )
        return cur.fetchone()["ok"]


def assignable_people(conn: psycopg.Connection, project_id: int) -> list[dict[str, Any]]:
    """Active employees on a team attached to the project (who a task may be assigned to)."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT u.id, u.first_name || ' ' || u.last_name AS name, u.job_title
            FROM project_teams pt
            JOIN team_members mem ON mem.team_id = pt.team_id
            JOIN users u ON u.id = mem.user_id
            WHERE pt.project_id = %s AND NOT u.is_archived AND u.role = 'employee'
            ORDER BY name
            """,
            (project_id,),
        )
        return cur.fetchall()


def notes(conn: psycopg.Connection, milestone_id: int) -> list[dict[str, Any]]:
    """A milestone's notes, oldest first."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT n.id, n.user_id AS author_id, u.first_name || ' ' || u.last_name AS author_name,
                   u.role::text AS author_role, n.note_text, n.created_at
            FROM milestone_notes n JOIN users u ON u.id = n.user_id
            WHERE n.milestone_id = %s ORDER BY n.created_at, n.id
            """,
            (milestone_id,),
        )
        return cur.fetchall()


def insert_note(conn: psycopg.Connection, milestone_id: int, user_id: int, text: str) -> int:
    """Add a note and return its id."""
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO milestone_notes (milestone_id, user_id, note_text) VALUES (%s, %s, %s) RETURNING id",
            (milestone_id, user_id, text),
        )
        return cur.fetchone()["id"]


def milestone_statuses(conn: psycopg.Connection, project_id: int) -> list[str]:
    """Statuses of a project's milestones in sequence."""
    with conn.cursor() as cur:
        cur.execute("SELECT status::text AS status FROM milestones WHERE project_id = %s ORDER BY sequence", (project_id,))
        return [row["status"] for row in cur.fetchall()]


def close_project(conn: psycopg.Connection, project_id: int) -> None:
    """Mark a project closed."""
    with conn.cursor() as cur:
        cur.execute("UPDATE projects SET status = 'closed', updated_at = now() WHERE id = %s", (project_id,))


def project_brief(conn: psycopg.Connection, project_id: int) -> dict[str, Any] | None:
    """Id, code, name, manager, status and archived flag of a project."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, code, name, manager_id, status::text AS status, is_archived FROM projects WHERE id = %s",
            (project_id,),
        )
        return cur.fetchone()


def now() -> datetime:
    """Timestamp for status stamps (one place to patch in tests)."""
    return datetime.now(UTC)
