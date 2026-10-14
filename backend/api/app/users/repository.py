"""SQL access for the users table and a person's profile figures. No business rules live here."""

from datetime import date
from typing import Any

import psycopg

# The f-strings below only interpolate this fixed column list; values are always bound parameters.
_COLUMNS = (
    "id, username, password_hash, first_name, last_name, email, "
    "job_title, role, hourly_rate, manager_id, department_id, is_archived, created_at, updated_at"
)

# A person with their department, manager, teams and hours this week (one row of the People table).
_PERSON_COLUMNS = """
           u.id, 'USR-' || lpad(u.id::text, 3, '0') AS code, u.username,
           u.first_name, u.last_name, u.first_name || ' ' || u.last_name AS name,
           u.email, u.job_title, u.role::text AS role,
           u.hourly_rate::float8 AS hourly_rate, u.manager_id, u.department_id, u.is_archived, u.created_at,
           d.department_name AS department,
           mg.first_name || ' ' || mg.last_name AS manager_name,
           coalesce(tn.names, '{}'::text[]) AS team_names,
           coalesce(wk.hours, 0)::float8 AS hours_this_week,
           coalesce(tk.total, 0) AS tasks_total,
           coalesce(tk.completed, 0) AS tasks_completed
"""

_PERSON_FROM = """
    FROM users u
    LEFT JOIN departments d ON d.id = u.department_id
    LEFT JOIN users mg ON mg.id = u.manager_id
    LEFT JOIN LATERAL (
        SELECT array_agg(tm.name ORDER BY tm.name) AS names
        FROM team_members mem JOIN teams tm ON tm.id = mem.team_id
        WHERE mem.user_id = u.id
    ) tn ON TRUE
    LEFT JOIN LATERAL (
        SELECT sum(te.hours) AS hours FROM time_entries te
        WHERE te.user_id = u.id AND te.work_date BETWEEN %(week_start)s AND %(week_end)s
    ) wk ON TRUE
    LEFT JOIN LATERAL (
        SELECT count(*) AS total, count(*) FILTER (WHERE t.status = 'completed') AS completed
        FROM tasks t JOIN milestones m ON m.id = t.milestone_id JOIN projects p ON p.id = m.project_id
        WHERE t.assigned_to = u.id AND NOT p.is_archived
    ) tk ON TRUE
"""


def find_by_username(conn: psycopg.Connection, username: str) -> dict[str, Any] | None:
    """Return the user row for a username, or None."""
    with conn.cursor() as cur:
        cur.execute(f"SELECT {_COLUMNS} FROM users WHERE username = %s", (username,))  # nosec B608
        return cur.fetchone()


def find_by_id(conn: psycopg.Connection, user_id: int) -> dict[str, Any] | None:
    """Return the user row for an id, or None."""
    with conn.cursor() as cur:
        cur.execute(f"SELECT {_COLUMNS} FROM users WHERE id = %s", (user_id,))  # nosec B608
        return cur.fetchone()


# --- People list and profile ------------------------------------------------------------------


def list_page(
    conn: psycopg.Connection,
    *,
    week_start: date,
    week_end: date,
    query: str | None = None,
    role: str | None = None,
    department_id: int | None = None,
    manager_id: int | None = None,
    archived: bool = False,
    page: int = 1,
    limit: int = 25,
) -> tuple[list[dict[str, Any]], int]:
    """One page of people matching the filters, and the total match count."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT "
            + _PERSON_COLUMNS
            + ", count(*) OVER () AS total_matches"
            + _PERSON_FROM
            + """
            WHERE u.is_archived = %(archived)s
              AND (%(role)s::text IS NULL OR u.role::text = %(role)s)
              AND (%(department_id)s::bigint IS NULL OR u.department_id = %(department_id)s)
              AND (%(manager_id)s::bigint IS NULL OR u.manager_id = %(manager_id)s)
              AND (%(query)s::text IS NULL
                   OR (u.first_name || ' ' || u.last_name) ILIKE %(query)s
                   OR u.email ILIKE %(query)s OR u.username ILIKE %(query)s
                   OR ('USR-' || lpad(u.id::text, 3, '0')) ILIKE %(query)s)
            ORDER BY u.last_name, u.first_name, u.id
            LIMIT %(limit)s OFFSET %(offset)s
            """,  # nosec B608 - only interpolates the fixed _PERSON_COLUMNS / _PERSON_FROM fragments
            {
                "week_start": week_start,
                "week_end": week_end,
                "archived": archived,
                "role": role,
                "department_id": department_id,
                "manager_id": manager_id,
                "query": f"%{query.strip()}%" if query and query.strip() else None,
                "limit": limit,
                "offset": (page - 1) * limit,
            },
        )
        rows = cur.fetchall()
    total = rows[0]["total_matches"] if rows else _count_matches(conn, query, role, department_id, manager_id, archived)
    return rows, total


def _count_matches(conn, query, role, department_id, manager_id, archived) -> int:
    """Total matches when the requested page is past the end (no rows to read the window from)."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT count(*) AS n FROM users u
            WHERE u.is_archived = %(archived)s
              AND (%(role)s::text IS NULL OR u.role::text = %(role)s)
              AND (%(department_id)s::bigint IS NULL OR u.department_id = %(department_id)s)
              AND (%(manager_id)s::bigint IS NULL OR u.manager_id = %(manager_id)s)
              AND (%(query)s::text IS NULL
                   OR (u.first_name || ' ' || u.last_name) ILIKE %(query)s
                   OR u.email ILIKE %(query)s OR u.username ILIKE %(query)s
                   OR ('USR-' || lpad(u.id::text, 3, '0')) ILIKE %(query)s)
            """,
            {
                "archived": archived,
                "role": role,
                "department_id": department_id,
                "manager_id": manager_id,
                "query": f"%{query.strip()}%" if query and query.strip() else None,
            },
        )
        return cur.fetchone()["n"]


def person(conn: psycopg.Connection, user_id: int, week_start: date, week_end: date) -> dict[str, Any] | None:
    """One person's row with hours this week and team names, archived or not."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT " + _PERSON_COLUMNS + _PERSON_FROM + " WHERE u.id = %(id)s",  # nosec B608
            {"id": user_id, "week_start": week_start, "week_end": week_end},
        )
        return cur.fetchone()


def role_counts(conn: psycopg.Connection) -> dict[str, int]:
    """Active people per role, plus how many are archived."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT count(*) FILTER (WHERE role = 'admin' AND NOT is_archived) AS admin,
                   count(*) FILTER (WHERE role = 'manager' AND NOT is_archived) AS manager,
                   count(*) FILTER (WHERE role = 'employee' AND NOT is_archived) AS employee,
                   count(*) FILTER (WHERE is_archived) AS archived
            FROM users
            """
        )
        return cur.fetchone()


def person_projects(conn: psycopg.Connection, user_id: int) -> list[dict[str, Any]]:
    """Projects the person manages or is on (team or task), with their own task figures."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT p.id, p.code, p.name, p.status::text AS status, d.department_name AS department,
                   CASE WHEN p.manager_id = %(user_id)s THEN 'manages' ELSE 'member' END AS relation,
                   coalesce(tk.total, 0) AS tasks_total,
                   coalesce(tk.completed, 0) AS tasks_completed,
                   coalesce(tk.planned_hours, 0)::float8 AS planned_hours,
                   coalesce(hr.hours, 0)::float8 AS actual_hours,
                   coalesce(hr.cost, 0)::float8 AS actual_cost
            FROM projects p
            JOIN departments d ON d.id = p.department_id
            LEFT JOIN LATERAL (
                SELECT count(*) AS total, count(*) FILTER (WHERE t.status = 'completed') AS completed,
                       sum(t.predicted_hours) AS planned_hours
                FROM tasks t JOIN milestones m ON m.id = t.milestone_id
                WHERE m.project_id = p.id AND t.assigned_to = %(user_id)s
            ) tk ON TRUE
            LEFT JOIN LATERAL (
                SELECT sum(te.hours) AS hours, sum(te.hours * u.hourly_rate) AS cost
                FROM time_entries te JOIN users u ON u.id = te.user_id
                JOIN tasks t ON t.id = te.task_id JOIN milestones m ON m.id = t.milestone_id
                WHERE m.project_id = p.id AND te.user_id = %(user_id)s
            ) hr ON TRUE
            WHERE NOT p.is_archived AND (
                p.manager_id = %(user_id)s
                OR EXISTS (SELECT 1 FROM project_teams pt JOIN team_members mem ON mem.team_id = pt.team_id
                           WHERE pt.project_id = p.id AND mem.user_id = %(user_id)s)
                OR EXISTS (SELECT 1 FROM tasks t JOIN milestones m ON m.id = t.milestone_id
                           WHERE m.project_id = p.id AND t.assigned_to = %(user_id)s))
            ORDER BY p.code
            """,
            {"user_id": user_id},
        )
        return cur.fetchall()


def person_teams(conn: psycopg.Connection, user_id: int) -> list[dict[str, Any]]:
    """Teams the person is a member of, or owns as a manager."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT tm.id, 'TEAM-' || lpad(tm.id::text, 2, '0') AS code, tm.name,
                   mg.first_name || ' ' || mg.last_name AS manager_name
            FROM teams tm
            JOIN users mg ON mg.id = tm.manager_id
            LEFT JOIN team_members mem ON mem.team_id = tm.id
            WHERE mem.user_id = %(user_id)s OR tm.manager_id = %(user_id)s
            ORDER BY tm.name, tm.id
            """,
            {"user_id": user_id},
        )
        return cur.fetchall()


def person_milestones(conn: psycopg.Connection, user_id: int) -> list[dict[str, Any]]:
    """Milestones holding the person's tasks, with their completed / total counts."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT m.id, m.name, m.sequence, m.status::text AS status, p.code AS project_code,
                   count(t.id) AS tasks_total,
                   count(t.id) FILTER (WHERE t.status = 'completed') AS tasks_completed
            FROM tasks t
            JOIN milestones m ON m.id = t.milestone_id
            JOIN projects p ON p.id = m.project_id
            WHERE t.assigned_to = %s AND NOT p.is_archived
            GROUP BY m.id, p.code
            ORDER BY p.code, m.sequence
            """,
            (user_id,),
        )
        return cur.fetchall()


def recent_entries(conn: psycopg.Connection, user_id: int, limit: int) -> list[dict[str, Any]]:
    """The person's latest time entries with the task and project they were logged on."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT te.id, te.work_date, te.hours::float8 AS hours, te.note,
                   (te.hours * u.hourly_rate)::float8 AS cost,
                   t.code AS task_code, t.title AS task_title, p.code AS project_code
            FROM time_entries te
            JOIN users u ON u.id = te.user_id
            JOIN tasks t ON t.id = te.task_id
            JOIN milestones m ON m.id = t.milestone_id
            JOIN projects p ON p.id = m.project_id
            WHERE te.user_id = %s
            ORDER BY te.work_date DESC, te.id DESC
            LIMIT %s
            """,
            (user_id, limit),
        )
        return cur.fetchall()


def lifetime_hours(conn: psycopg.Connection, user_id: int) -> dict[str, Any]:
    """Every hour the person ever logged, and its cost at their current rate."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT coalesce(sum(te.hours), 0)::float8 AS hours,
                   coalesce(sum(te.hours * u.hourly_rate), 0)::float8 AS cost
            FROM time_entries te JOIN users u ON u.id = te.user_id
            WHERE te.user_id = %s
            """,
            (user_id,),
        )
        return cur.fetchone()


# --- Blocker counts ---------------------------------------------------------------------------


def active_project_count(conn: psycopg.Connection, manager_id: int) -> int:
    """Active, non-archived projects the person manages."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT count(*) AS n FROM projects WHERE manager_id = %s AND status = 'active' AND NOT is_archived",
            (manager_id,),
        )
        return cur.fetchone()["n"]


def open_task_count(conn: psycopg.Connection, user_id: int) -> int:
    """Tasks assigned to the person that are not completed, on live projects."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT count(*) AS n FROM tasks t
            JOIN milestones m ON m.id = t.milestone_id JOIN projects p ON p.id = m.project_id
            WHERE t.assigned_to = %s AND t.status <> 'completed' AND NOT p.is_archived
            """,
            (user_id,),
        )
        return cur.fetchone()["n"]


def pickable_people(
    conn: psycopg.Connection,
    manager_id: int,
    week_start: date,
    week_end: date,
    *,
    query: str | None = None,
    job_title: str | None = None,
    exclude_team_id: int | None = None,
    limit: int = 25,
) -> tuple[list[dict[str, Any]], int]:
    """
    Active employees a manager may put on a team: their own direct reports and unassigned
    people, never another manager's. Optional name/email search and exact job title filter;
    `exclude_team_id` hides people already on that team. First `limit` by name, plus the
    total match count so the picker can say how many more there are.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT u.id, u.first_name || ' ' || u.last_name AS name, u.email, u.job_title, u.manager_id,
                   coalesce((SELECT sum(te.hours) FROM time_entries te
                             WHERE te.user_id = u.id AND te.work_date BETWEEN %(week_start)s AND %(week_end)s), 0)::float8 AS hours_this_week,
                   count(*) OVER () AS total_matches
            FROM users u
            WHERE u.role = 'employee' AND NOT u.is_archived
              AND (u.manager_id = %(manager_id)s OR u.manager_id IS NULL)
              AND (%(job_title)s::text IS NULL OR u.job_title = %(job_title)s)
              AND (%(query)s::text IS NULL OR (u.first_name || ' ' || u.last_name) ILIKE %(query)s OR u.email ILIKE %(query)s)
              AND (%(team_id)s::bigint IS NULL
                   OR NOT EXISTS (SELECT 1 FROM team_members m WHERE m.team_id = %(team_id)s AND m.user_id = u.id))
            ORDER BY u.last_name, u.first_name, u.id
            LIMIT %(limit)s
            """,
            {
                "manager_id": manager_id,
                "week_start": week_start,
                "week_end": week_end,
                "job_title": job_title.strip() if job_title and job_title.strip() else None,
                "query": f"%{query.strip()}%" if query and query.strip() else None,
                "team_id": exclude_team_id,
                "limit": limit,
            },
        )
        rows = cur.fetchall()
    return rows, (rows[0]["total_matches"] if rows else 0)


def pickable_job_titles(conn: psycopg.Connection, manager_id: int) -> list[str]:
    """Distinct job titles among the people the manager may pick, for the picker's filter."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT job_title FROM users
            WHERE role = 'employee' AND NOT is_archived AND job_title IS NOT NULL AND job_title <> ''
              AND (manager_id = %s OR manager_id IS NULL)
            ORDER BY job_title
            """,
            (manager_id,),
        )
        return [r["job_title"] for r in cur.fetchall()]


def leave_manager_teams(conn: psycopg.Connection, manager_id: int, user_id: int) -> list[str]:
    """Take the person off every team the manager owns; returns the names of the teams left."""
    with conn.cursor() as cur:
        cur.execute(
            """
            DELETE FROM team_members m USING teams t
            WHERE t.id = m.team_id AND t.manager_id = %s AND m.user_id = %s
            RETURNING t.name
            """,
            (manager_id, user_id),
        )
        return [r["name"] for r in cur.fetchall()]


def direct_report_count(conn: psycopg.Connection, manager_id: int) -> int:
    """Active people reporting to the manager."""
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM users WHERE manager_id = %s AND NOT is_archived", (manager_id,))
        return cur.fetchone()["n"]


def active_admin_count(conn: psycopg.Connection) -> int:
    """How many administrators can still sign in."""
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM users WHERE role = 'admin' AND NOT is_archived")
        return cur.fetchone()["n"]


# --- Writes -----------------------------------------------------------------------------------


def email_taken(conn: psycopg.Connection, email: str, exclude_id: int | None = None) -> bool:
    """True if another user already has this email (case-insensitive)."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT 1 FROM users WHERE lower(email) = lower(%s) AND (%s::bigint IS NULL OR id <> %s)",
            (email, exclude_id, exclude_id),
        )
        return cur.fetchone() is not None


def username_taken(conn: psycopg.Connection, username: str) -> bool:
    """True if the username exists."""
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM users WHERE username = %s", (username,))
        return cur.fetchone() is not None


def department_exists(conn: psycopg.Connection, department_id: int) -> bool:
    """True if the department exists."""
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM departments WHERE id = %s", (department_id,))
        return cur.fetchone() is not None


def insert(conn: psycopg.Connection, *, username: str, password_hash: str, fields: dict[str, Any]) -> int:
    """Insert a user and return its id. `fields` holds the profile columns from UserCreate."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO users
                (username, password_hash, first_name, last_name, email, job_title, role,
                 hourly_rate, manager_id, department_id)
            VALUES (%(username)s, %(password_hash)s, %(first_name)s, %(last_name)s, %(email)s, %(job_title)s,
                    %(role)s, %(hourly_rate)s, %(manager_id)s, %(department_id)s)
            RETURNING id
            """,
            {**fields, "username": username, "password_hash": password_hash},
        )
        return cur.fetchone()["id"]


def update(conn: psycopg.Connection, user_id: int, fields: dict[str, Any]) -> None:
    """Set the given columns on a user. `fields` keys are validated by the service."""
    if not fields:
        return
    assignments = ", ".join(f"{column} = %({column})s" for column in fields)
    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE users SET {assignments}, updated_at = now() WHERE id = %(id)s",  # nosec B608 - column names come from a fixed allow-list
            {**fields, "id": user_id},
        )


def set_archived(conn: psycopg.Connection, user_id: int, archived: bool) -> None:
    """Archive or restore a user."""
    with conn.cursor() as cur:
        cur.execute("UPDATE users SET is_archived = %s, updated_at = now() WHERE id = %s", (archived, user_id))


def manager_options(conn: psycopg.Connection) -> list[dict[str, Any]]:
    """Active managers, for the person form."""
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
