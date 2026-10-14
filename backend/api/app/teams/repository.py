"""SQL for teams, their members and project links, and the employee's team view."""

from datetime import date
from typing import Any

import psycopg

from app.overview.repository import _MILESTONE_LOCKED


def _team_rows(conn: psycopg.Connection, where: str, params: dict[str, Any]) -> list[dict[str, Any]]:
    """Teams with members and projects as JSON lists. `where` is a fixed fragment from this module."""
    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT tm.id, 'TEAM-' || lpad(tm.id::text, 2, '0') AS code, tm.name, tm.manager_id,
                   mg.first_name || ' ' || mg.last_name AS manager_name, mg.email AS manager_email,
                   coalesce(mem.members, '[]'::json) AS members,
                   coalesce(pr.projects, '[]'::json) AS projects,
                   coalesce(mem.hours, 0)::float8 AS hours_this_week
            FROM teams tm
            JOIN users mg ON mg.id = tm.manager_id
            LEFT JOIN LATERAL (
                SELECT json_agg(json_build_object(
                           'id', u.id, 'name', u.first_name || ' ' || u.last_name, 'email', u.email,
                           'job_title', u.job_title, 'hours_this_week', coalesce(wk.hours, 0)::float8)
                           ORDER BY u.last_name, u.first_name) AS members,
                       sum(coalesce(wk.hours, 0)) AS hours
                FROM team_members m
                JOIN users u ON u.id = m.user_id
                LEFT JOIN LATERAL (
                    SELECT sum(te.hours) AS hours FROM time_entries te
                    WHERE te.user_id = u.id AND te.work_date BETWEEN %(week_start)s AND %(week_end)s
                ) wk ON TRUE
                WHERE m.team_id = tm.id AND NOT u.is_archived
            ) mem ON TRUE
            LEFT JOIN LATERAL (
                SELECT json_agg(json_build_object('id', p.id, 'code', p.code, 'name', p.name, 'status', p.status::text)
                                ORDER BY p.code) AS projects
                FROM project_teams pt JOIN projects p ON p.id = pt.project_id
                WHERE pt.team_id = tm.id AND NOT p.is_archived
            ) pr ON TRUE
            WHERE {where}
            ORDER BY tm.name, tm.id
            """,  # nosec B608 - `where` is one of the fixed fragments below
            params,
        )
        return cur.fetchall()


def teams_of_manager(conn: psycopg.Connection, manager_id: int, week_start: date, week_end: date) -> list[dict[str, Any]]:
    """A manager's teams with members, projects and hours this week."""
    return _team_rows(conn, "tm.manager_id = %(manager_id)s", {"manager_id": manager_id, "week_start": week_start, "week_end": week_end})


def team_detail(conn: psycopg.Connection, team_id: int, week_start: date, week_end: date) -> dict[str, Any] | None:
    """One team with members and projects, or None."""
    rows = _team_rows(conn, "tm.id = %(team_id)s", {"team_id": team_id, "week_start": week_start, "week_end": week_end})
    return rows[0] if rows else None


def teams_of_member(conn: psycopg.Connection, user_id: int, week_start: date, week_end: date) -> list[dict[str, Any]]:
    """Teams the person is a member of."""
    return _team_rows(
        conn,
        "EXISTS (SELECT 1 FROM team_members x WHERE x.team_id = tm.id AND x.user_id = %(user_id)s)",
        {"user_id": user_id, "week_start": week_start, "week_end": week_end},
    )


def team(conn: psycopg.Connection, team_id: int) -> dict[str, Any] | None:
    """A team's id, name and owner, or None."""
    with conn.cursor() as cur:
        cur.execute("SELECT id, name, manager_id FROM teams WHERE id = %s", (team_id,))
        return cur.fetchone()


def insert_team(conn: psycopg.Connection, name: str, manager_id: int) -> int:
    """Create a team and return its id."""
    with conn.cursor() as cur:
        cur.execute("INSERT INTO teams (name, manager_id) VALUES (%s, %s) RETURNING id", (name, manager_id))
        return cur.fetchone()["id"]


def rename_team(conn: psycopg.Connection, team_id: int, name: str) -> None:
    """Change a team's name."""
    with conn.cursor() as cur:
        cur.execute("UPDATE teams SET name = %s WHERE id = %s", (name, team_id))


def is_member(conn: psycopg.Connection, team_id: int, user_id: int) -> bool:
    """True if the person is on the team."""
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM team_members WHERE team_id = %s AND user_id = %s", (team_id, user_id))
        return cur.fetchone() is not None


def add_member(conn: psycopg.Connection, team_id: int, user_id: int) -> None:
    """Put a person on a team."""
    with conn.cursor() as cur:
        cur.execute("INSERT INTO team_members (team_id, user_id) VALUES (%s, %s) ON CONFLICT DO NOTHING", (team_id, user_id))


def remove_member(conn: psycopg.Connection, team_id: int, user_id: int) -> None:
    """Take a person off a team."""
    with conn.cursor() as cur:
        cur.execute("DELETE FROM team_members WHERE team_id = %s AND user_id = %s", (team_id, user_id))


def is_attached(conn: psycopg.Connection, project_id: int, team_id: int) -> bool:
    """True if the team works on the project."""
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM project_teams WHERE project_id = %s AND team_id = %s", (project_id, team_id))
        return cur.fetchone() is not None


def attach_project(conn: psycopg.Connection, project_id: int, team_id: int) -> None:
    """Link a team to a project."""
    with conn.cursor() as cur:
        cur.execute("INSERT INTO project_teams (project_id, team_id) VALUES (%s, %s) ON CONFLICT DO NOTHING", (project_id, team_id))


def detach_project(conn: psycopg.Connection, project_id: int, team_id: int) -> None:
    """Unlink a team from a project."""
    with conn.cursor() as cur:
        cur.execute("DELETE FROM project_teams WHERE project_id = %s AND team_id = %s", (project_id, team_id))


def manager_project_options(conn: psycopg.Connection, manager_id: int) -> list[dict[str, Any]]:
    """Active projects the manager owns (which their teams may be attached to)."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, code, name, status::text AS status FROM projects
            WHERE manager_id = %s AND status = 'active' AND NOT is_archived ORDER BY code
            """,
            (manager_id,),
        )
        return cur.fetchall()


# --- Employee: My teams -----------------------------------------------------------------------


def member_progress(conn: psycopg.Connection, team_id: int) -> list[dict[str, Any]]:
    """Each active member's completed / total tasks across the team's projects."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT u.id, u.first_name || ' ' || u.last_name AS name, u.job_title,
                   count(t.id) AS tasks_total,
                   count(t.id) FILTER (WHERE t.status = 'completed') AS tasks_completed
            FROM team_members mem
            JOIN users u ON u.id = mem.user_id
            LEFT JOIN tasks t ON t.assigned_to = u.id AND t.milestone_id IN (
                SELECT m.id FROM milestones m
                JOIN project_teams pt ON pt.project_id = m.project_id
                WHERE pt.team_id = mem.team_id
            )
            WHERE mem.team_id = %s AND NOT u.is_archived
            GROUP BY u.id
            ORDER BY u.last_name, u.first_name
            """,
            (team_id,),
        )
        return cur.fetchall()


def my_milestone_figures(conn: psycopg.Connection, user_id: int, milestone_id: int) -> dict[str, Any]:
    """The person's task counts and hours inside one milestone."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT count(t.id) AS tasks_total,
                   count(t.id) FILTER (WHERE t.status = 'completed') AS tasks_completed,
                   coalesce(sum(t.predicted_hours), 0)::float8 AS planned_hours,
                   coalesce((SELECT sum(te.hours) FROM time_entries te JOIN tasks tt ON tt.id = te.task_id
                             WHERE te.user_id = %(user_id)s AND tt.milestone_id = %(milestone_id)s), 0)::float8 AS actual_hours
            FROM tasks t
            WHERE t.milestone_id = %(milestone_id)s AND t.assigned_to = %(user_id)s
            """,
            {"user_id": user_id, "milestone_id": milestone_id},
        )
        return cur.fetchone()


def current_milestone(conn: psycopg.Connection, project_id: int) -> dict[str, Any] | None:
    """The first milestone of a project that is not completed, with lock state and task counts."""
    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT m.id, m.sequence, m.name, m.status::text AS status, m.projected_end_date,
                   {_MILESTONE_LOCKED} AS locked,
                   (SELECT count(*) FROM tasks t WHERE t.milestone_id = m.id) AS tasks_total,
                   (SELECT count(*) FROM tasks t WHERE t.milestone_id = m.id AND t.status = 'completed') AS tasks_completed
            FROM milestones m
            WHERE m.project_id = %s AND m.status <> 'completed'
            ORDER BY m.sequence LIMIT 1
            """,  # nosec B608 - only interpolates the fixed _MILESTONE_LOCKED fragment
            (project_id,),
        )
        return cur.fetchone()
