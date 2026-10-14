"""Tests for migration 002: the tables exist and the database enforces its own rules."""

import psycopg
import pytest
from psycopg import errors

CORE_TABLES = {
    "departments",
    "users",
    "projects",
    "teams",
    "team_members",
    "project_teams",
    "milestones",
    "tasks",
    "task_resources",
    "time_entries",
    "milestone_notes",
    "audit_log",
}


@pytest.fixture
def db(conn: psycopg.Connection):
    """A connection whose writes are rolled back when the test ends."""
    with conn.transaction(force_rollback=True):
        yield conn


def _user_id(db: psycopg.Connection, username: str) -> int:
    return db.execute("SELECT id FROM users WHERE username = %s", (username,)).fetchone()["id"]


def _department(db: psycopg.Connection, prefix: str = "TST") -> int:
    return db.execute(
        "INSERT INTO departments (department_name, prefix) VALUES (%s, %s) RETURNING id",
        (f"Test {prefix}", prefix),
    ).fetchone()["id"]


def _project(db: psycopg.Connection, department_id: int, code: str = "TST-001") -> int:
    return db.execute(
        """
        INSERT INTO projects (code, name, department_id, manager_id, start_date, end_date)
        VALUES (%s, 'Test project', %s, %s, '2026-01-01', '2026-06-30')
        RETURNING id
        """,
        (code, department_id, _user_id(db, "mgr001")),
    ).fetchone()["id"]


def _expect(db: psycopg.Connection, error: type[Exception], sql: str, params: tuple = ()) -> None:
    """Run sql in a savepoint and assert the database rejects it."""
    with pytest.raises(error), db.transaction():
        db.execute(sql, params)


def test_all_core_tables_exist(db):
    rows = db.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'").fetchall()
    assert CORE_TABLES <= {row["table_name"] for row in rows}


def test_users_gain_department_id(db):
    department_id = _department(db)
    db.execute("UPDATE users SET department_id = %s WHERE username = 'emp001'", (department_id,))
    row = db.execute("SELECT department_id FROM users WHERE username = 'emp001'").fetchone()
    assert row["department_id"] == department_id


def test_department_prefix_must_be_three_capitals(db):
    _expect(db, errors.CheckViolation, "INSERT INTO departments (department_name, prefix) VALUES ('Lower', 'abc')")


def test_project_requires_a_manager(db):
    department_id = _department(db)
    _expect(
        db,
        errors.NotNullViolation,
        """
        INSERT INTO projects (code, name, department_id, start_date, end_date)
        VALUES ('TST-002', 'No manager', %s, '2026-01-01', '2026-02-01')
        """,
        (department_id,),
    )


def test_project_end_date_cannot_precede_start(db):
    department_id = _department(db)
    _expect(
        db,
        errors.CheckViolation,
        """
        INSERT INTO projects (code, name, department_id, manager_id, start_date, end_date)
        VALUES ('TST-003', 'Backwards', %s, %s, '2026-06-01', '2026-01-01')
        """,
        (department_id, _user_id(db, "mgr001")),
    )


def test_milestone_sequence_is_unique_per_project(db):
    project_id = _project(db, _department(db))
    db.execute("INSERT INTO milestones (project_id, name, sequence) VALUES (%s, 'First', 1)", (project_id,))
    _expect(
        db,
        errors.UniqueViolation,
        "INSERT INTO milestones (project_id, name, sequence) VALUES (%s, 'Also first', 1)",
        (project_id,),
    )


def test_time_entry_hours_must_be_positive(db):
    project_id = _project(db, _department(db))
    milestone_id = db.execute(
        "INSERT INTO milestones (project_id, name, sequence) VALUES (%s, 'M1', 1) RETURNING id", (project_id,)
    ).fetchone()["id"]
    employee_id = _user_id(db, "emp001")
    task_id = db.execute(
        """
        INSERT INTO tasks (code, milestone_id, assigned_to, title)
        VALUES ('TSK-' || nextval('task_code_seq'), %s, %s, 'Task') RETURNING id
        """,
        (milestone_id, employee_id),
    ).fetchone()["id"]
    _expect(
        db,
        errors.CheckViolation,
        "INSERT INTO time_entries (task_id, user_id, work_date, hours) VALUES (%s, %s, '2026-03-02', 0)",
        (task_id, employee_id),
    )


def test_deleting_a_team_removes_its_join_rows(db):
    project_id = _project(db, _department(db))
    team_id = db.execute(
        "INSERT INTO teams (name, manager_id) VALUES ('Core', %s) RETURNING id", (_user_id(db, "mgr001"),)
    ).fetchone()["id"]
    db.execute("INSERT INTO team_members (team_id, user_id) VALUES (%s, %s)", (team_id, _user_id(db, "emp001")))
    db.execute("INSERT INTO project_teams (project_id, team_id) VALUES (%s, %s)", (project_id, team_id))

    db.execute("DELETE FROM teams WHERE id = %s", (team_id,))

    assert db.execute("SELECT count(*) AS n FROM team_members WHERE team_id = %s", (team_id,)).fetchone()["n"] == 0
    assert db.execute("SELECT count(*) AS n FROM project_teams WHERE team_id = %s", (team_id,)).fetchone()["n"] == 0


def test_deleting_a_project_with_milestones_is_blocked(db):
    project_id = _project(db, _department(db))
    db.execute("INSERT INTO milestones (project_id, name, sequence) VALUES (%s, 'M1', 1)", (project_id,))
    _expect(db, errors.ForeignKeyViolation, "DELETE FROM projects WHERE id = %s", (project_id,))
