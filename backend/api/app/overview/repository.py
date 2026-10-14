"""
SQL for the three Overview pages. Read-only; no business rules live here.

Sums come back as float8 so the service does plain arithmetic. Archived projects
are excluded everywhere. Cost uses the hourly rate of the person who logged the
hours (actual) or is assigned the task (planned), per MANAGER.md §2.
"""

from datetime import date
from typing import Any

import psycopg

# A milestone is locked while any earlier milestone in its project is not completed.
_MILESTONE_LOCKED = """
    EXISTS (
        SELECT 1 FROM milestones prev
        WHERE prev.project_id = m.project_id AND prev.sequence < m.sequence AND prev.status <> 'completed'
    )
"""


def project_rows(
    conn: psycopg.Connection,
    *,
    manager_id: int | None = None,
    project_ids: list[int] | None = None,
) -> list[dict[str, Any]]:
    """Active projects with task counts, planned/actual hours and cost, optionally filtered."""
    with conn.cursor() as cur:
        cur.execute(
            """
            WITH task_totals AS (
                SELECT m.project_id,
                       count(t.id) AS tasks_total,
                       count(t.id) FILTER (WHERE t.status = 'completed') AS tasks_completed,
                       sum(t.predicted_hours) AS planned_hours,
                       sum(t.predicted_hours * u.hourly_rate) AS planned_labour
                FROM milestones m
                JOIN tasks t ON t.milestone_id = m.id
                JOIN users u ON u.id = t.assigned_to
                GROUP BY m.project_id
            ),
            hour_totals AS (
                SELECT m.project_id,
                       sum(te.hours) AS actual_hours,
                       sum(te.hours * u.hourly_rate) AS actual_labour
                FROM time_entries te
                JOIN tasks t ON t.id = te.task_id
                JOIN milestones m ON m.id = t.milestone_id
                JOIN users u ON u.id = te.user_id
                GROUP BY m.project_id
            ),
            resource_totals AS (
                SELECT m.project_id,
                       sum(r.estimated_cost) AS planned_resources,
                       sum(r.actual_cost) AS actual_resources
                FROM task_resources r
                JOIN tasks t ON t.id = r.task_id
                JOIN milestones m ON m.id = t.milestone_id
                GROUP BY m.project_id
            )
            SELECT p.id, p.code, p.name, p.description, p.start_date, p.end_date,
                   p.budget::float8 AS budget,
                   d.department_name AS department,
                   p.manager_id,
                   mu.first_name || ' ' || mu.last_name AS manager_name,
                   coalesce(tt.tasks_total, 0) AS tasks_total,
                   coalesce(tt.tasks_completed, 0) AS tasks_completed,
                   coalesce(tt.planned_hours, 0)::float8 AS planned_hours,
                   coalesce(ht.actual_hours, 0)::float8 AS actual_hours,
                   (coalesce(tt.planned_labour, 0) + coalesce(rt.planned_resources, 0))::float8 AS planned_cost,
                   (coalesce(ht.actual_labour, 0) + coalesce(rt.actual_resources, 0))::float8 AS actual_cost,
                   EXISTS (
                       SELECT 1 FROM milestones am
                       WHERE am.project_id = p.id AND am.status = 'in_progress'
                         AND am.projected_end_date < current_date
                   ) AS milestone_overdue
            FROM projects p
            JOIN departments d ON d.id = p.department_id
            JOIN users mu ON mu.id = p.manager_id
            LEFT JOIN task_totals tt ON tt.project_id = p.id
            LEFT JOIN hour_totals ht ON ht.project_id = p.id
            LEFT JOIN resource_totals rt ON rt.project_id = p.id
            WHERE p.status = 'active' AND NOT p.is_archived
              AND (%(manager_id)s::bigint IS NULL OR p.manager_id = %(manager_id)s)
              AND (%(project_ids)s::bigint[] IS NULL OR p.id = ANY(%(project_ids)s))
            ORDER BY p.code
            """,
            {"manager_id": manager_id, "project_ids": project_ids},
        )
        return cur.fetchall()


def milestone_rows(conn: psycopg.Connection, project_id: int) -> list[dict[str, Any]]:
    """A project's milestones in sequence, with task counts and lock state."""
    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT m.id, m.sequence, m.name, m.status::text AS status,
                   m.start_date, m.projected_end_date, m.completed_at,
                   count(t.id) AS tasks_total,
                   count(t.id) FILTER (WHERE t.status = 'completed') AS tasks_completed,
                   {_MILESTONE_LOCKED} AS locked
            FROM milestones m
            LEFT JOIN tasks t ON t.milestone_id = m.id
            WHERE m.project_id = %s
            GROUP BY m.id
            ORDER BY m.sequence
            """,  # nosec B608 - only interpolates the fixed _MILESTONE_LOCKED fragment
            (project_id,),
        )
        return cur.fetchall()


def next_milestone(conn: psycopg.Connection, project_id: int, sequence: int) -> dict[str, Any] | None:
    """The milestone after `sequence` in a project, or None."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT name, projected_end_date FROM milestones
            WHERE project_id = %s AND sequence > %s
            ORDER BY sequence LIMIT 1
            """,
            (project_id, sequence),
        )
        return cur.fetchone()


# --- Employee ---------------------------------------------------------------------------------


def employee_tasks(conn: psycopg.Connection, user_id: int) -> list[dict[str, Any]]:
    """Every task assigned to the user on a live project, with milestone context and their hours."""
    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT t.id, t.code, t.title, t.status::text AS status, t.due_date,
                   t.predicted_hours::float8 AS planned_hours,
                   m.id AS milestone_id, m.name AS milestone_name, m.sequence AS milestone_sequence,
                   m.status::text AS milestone_status, m.projected_end_date AS milestone_due,
                   {_MILESTONE_LOCKED} AS milestone_locked,
                   p.id AS project_id, p.code AS project_code, p.name AS project_name,
                   coalesce((SELECT sum(te.hours) FROM time_entries te
                             WHERE te.task_id = t.id AND te.user_id = t.assigned_to), 0)::float8 AS actual_hours
            FROM tasks t
            JOIN milestones m ON m.id = t.milestone_id
            JOIN projects p ON p.id = m.project_id
            WHERE t.assigned_to = %s AND NOT p.is_archived
            ORDER BY t.due_date NULLS LAST, t.code
            """,  # nosec B608 - only interpolates the fixed _MILESTONE_LOCKED fragment
            (user_id,),
        )
        return cur.fetchall()


def employee_projects(conn: psycopg.Connection, user_id: int) -> list[dict[str, Any]]:
    """Active projects the user is on through a team, with department, manager and team names."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT p.id, p.code, p.name, d.department_name AS department,
                   mu.first_name || ' ' || mu.last_name AS manager_name,
                   string_agg(DISTINCT tm.name, ', ') AS team_names
            FROM team_members mem
            JOIN teams tm ON tm.id = mem.team_id
            JOIN project_teams pt ON pt.team_id = mem.team_id
            JOIN projects p ON p.id = pt.project_id
            JOIN departments d ON d.id = p.department_id
            JOIN users mu ON mu.id = p.manager_id
            WHERE mem.user_id = %s AND p.status = 'active' AND NOT p.is_archived
            GROUP BY p.id, d.department_name, mu.first_name, mu.last_name
            ORDER BY p.code
            """,
            (user_id,),
        )
        return cur.fetchall()


def employee_hours(conn: psycopg.Connection, user_id: int, week_start: date, week_end: date) -> dict[str, Any]:
    """The user's logged hours this week and in total."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT coalesce(sum(hours) FILTER (WHERE work_date BETWEEN %s AND %s), 0)::float8 AS week_hours,
                   coalesce(sum(hours), 0)::float8 AS lifetime_hours
            FROM time_entries WHERE user_id = %s
            """,
            (week_start, week_end, user_id),
        )
        return cur.fetchone()


def milestone_task_counts(conn: psycopg.Connection, milestone_id: int) -> dict[str, Any]:
    """Completed and total tasks in a milestone, across everyone on it."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT count(*) AS total, count(*) FILTER (WHERE status = 'completed') AS completed
            FROM tasks WHERE milestone_id = %s
            """,
            (milestone_id,),
        )
        return cur.fetchone()


# --- Manager ----------------------------------------------------------------------------------


def review_queue(conn: psycopg.Connection, manager_id: int) -> list[dict[str, Any]]:
    """Submitted tasks on the manager's projects, oldest submission first."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT t.id, t.code, t.title, t.submitted_at,
                   t.predicted_hours::float8 AS planned_hours,
                   u.first_name || ' ' || u.last_name AS employee_name,
                   p.code AS project_code, m.name AS milestone_name,
                   coalesce(sum(te.hours), 0)::float8 AS actual_hours,
                   coalesce(sum(te.hours * eu.hourly_rate), 0)::float8 AS actual_cost
            FROM tasks t
            JOIN milestones m ON m.id = t.milestone_id
            JOIN projects p ON p.id = m.project_id
            JOIN users u ON u.id = t.assigned_to
            LEFT JOIN time_entries te ON te.task_id = t.id
            LEFT JOIN users eu ON eu.id = te.user_id
            WHERE p.manager_id = %s AND NOT p.is_archived AND t.status = 'submitted'
            GROUP BY t.id, u.first_name, u.last_name, p.code, m.name
            ORDER BY t.submitted_at, t.code
            """,
            (manager_id,),
        )
        return cur.fetchall()


def direct_reports(conn: psycopg.Connection, manager_id: int, week_start: date, week_end: date) -> list[dict[str, Any]]:
    """The manager's direct reports with hours this week, teams and task progress on the manager's projects."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT u.id, u.first_name, u.last_name, u.job_title,
                   coalesce(wk.hours, 0)::float8 AS hours_this_week,
                   coalesce(tk.total, 0) AS tasks_total,
                   coalesce(tk.completed, 0) AS tasks_completed,
                   tms.names AS team_names
            FROM users u
            LEFT JOIN LATERAL (
                SELECT sum(te.hours) AS hours FROM time_entries te
                WHERE te.user_id = u.id AND te.work_date BETWEEN %(week_start)s AND %(week_end)s
            ) wk ON TRUE
            LEFT JOIN LATERAL (
                SELECT count(*) AS total, count(*) FILTER (WHERE t.status = 'completed') AS completed
                FROM tasks t
                JOIN milestones m ON m.id = t.milestone_id
                JOIN projects p ON p.id = m.project_id
                WHERE t.assigned_to = u.id AND p.manager_id = %(manager_id)s AND NOT p.is_archived
            ) tk ON TRUE
            LEFT JOIN LATERAL (
                SELECT string_agg(tm.name, ', ' ORDER BY tm.name) AS names
                FROM team_members mem JOIN teams tm ON tm.id = mem.team_id
                WHERE mem.user_id = u.id
            ) tms ON TRUE
            WHERE u.manager_id = %(manager_id)s AND NOT u.is_archived
            ORDER BY u.last_name, u.first_name
            """,
            {"manager_id": manager_id, "week_start": week_start, "week_end": week_end},
        )
        return cur.fetchall()


# --- Admin ------------------------------------------------------------------------------------


def manager_coverage(conn: psycopg.Connection) -> list[dict[str, Any]]:
    """Every active manager with their active project count and the budget they own."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT u.id, u.first_name, u.last_name,
                   count(p.id) AS active_projects,
                   coalesce(sum(p.budget), 0)::float8 AS budget_owned
            FROM users u
            LEFT JOIN projects p ON p.manager_id = u.id AND p.status = 'active' AND NOT p.is_archived
            WHERE u.role = 'manager' AND NOT u.is_archived
            GROUP BY u.id
            ORDER BY u.last_name, u.first_name
            """
        )
        return cur.fetchall()


def active_user_count(conn: psycopg.Connection) -> int:
    """How many users are not archived."""
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM users WHERE NOT is_archived")
        return cur.fetchone()["n"]


def latest_audit(conn: psycopg.Connection, limit: int) -> list[dict[str, Any]]:
    """The newest audit log entries with the actor's name."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT a.id, a.created_at, a.action, a.entity_type, a.entity_code, a.summary,
                   u.first_name || ' ' || u.last_name AS actor_name
            FROM audit_log a
            JOIN users u ON u.id = a.actor_user_id
            ORDER BY a.created_at DESC, a.id DESC
            LIMIT %s
            """,
            (limit,),
        )
        return cur.fetchall()
