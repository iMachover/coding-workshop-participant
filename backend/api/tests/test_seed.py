"""Tests for the development seed's sample data."""

from app.db.seed import apply_seed


def _count(conn, sql: str, params: tuple = ()) -> int:
    return conn.execute(sql, params).fetchone()["n"]


def test_sample_projects_are_seeded(conn):
    rows = conn.execute("SELECT code FROM projects ORDER BY code").fetchall()
    assert {"INF-024", "OPS-018"} <= {row["code"] for row in rows}
    assert _count(conn, "SELECT count(*) AS n FROM milestones m JOIN projects p ON p.id = m.project_id WHERE p.code = 'INF-024'") == 3


def test_seeded_users_have_departments(conn):
    row = conn.execute(
        "SELECT d.prefix FROM users u JOIN departments d ON d.id = u.department_id WHERE u.username = 'emp004'"
    ).fetchone()
    assert row["prefix"] == "OPS"


def test_seeded_employee_is_on_a_project_through_a_team(conn):
    codes = conn.execute(
        """
        SELECT p.code FROM users u
        JOIN team_members tm ON tm.user_id = u.id
        JOIN project_teams pt ON pt.team_id = tm.team_id
        JOIN projects p ON p.id = pt.project_id
        WHERE u.username = 'emp001'
        """
    ).fetchall()
    assert [row["code"] for row in codes] == ["INF-024"]


def test_seeded_employee_has_recent_hours(conn):
    hours = conn.execute(
        """
        SELECT coalesce(sum(t.hours), 0) AS n FROM time_entries t JOIN users u ON u.id = t.user_id
        WHERE u.username = 'emp001' AND t.work_date >= current_date - 7
        """
    ).fetchone()["n"]
    assert hours > 0


def test_seeded_employees_have_at_most_one_active_milestone(conn):
    rows = conn.execute(
        """
        SELECT assigned_to, count(DISTINCT milestone_id) AS n FROM tasks
        WHERE status IN ('in_progress', 'submitted') GROUP BY assigned_to
        """
    ).fetchall()
    assert all(row["n"] == 1 for row in rows)


def test_reseeding_creates_nothing(conn):
    tables = ("users", "departments", "projects", "milestones", "tasks", "time_entries", "teams")
    before = {t: _count(conn, f"SELECT count(*) AS n FROM {t}") for t in tables}  # nosec B608 - fixed names
    assert apply_seed(conn) == 0
    after = {t: _count(conn, f"SELECT count(*) AS n FROM {t}") for t in tables}  # nosec B608 - fixed names
    assert after == before
