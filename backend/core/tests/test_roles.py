"""The roles table: every user's role is a row in roles, and older databases migrate to it."""

from pathlib import Path
from typing import get_args

import psycopg
import pytest

import db
import tokens
from schemas import Role
from tests.conftest import bearer

SCHEMA_SQL = Path(__file__).resolve().parent.parent / "sql" / "schema.sql"

# Puts users back the way it was before the roles table: role as text, no role_id.
OLD_USERS_SHAPE_SQL = """
    ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'employee'
        CHECK (role IN ('employee', 'engineer', 'admin'));
    UPDATE users u SET role = r.role_name FROM roles r WHERE r.role_id = u.role_id;
    ALTER TABLE users DROP COLUMN role_id;
"""


def _users_columns(run_sql) -> set[str]:
    """The names of the users table's columns."""
    rows = run_sql("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'")
    return {row["column_name"] for row in rows}


def test_the_roles_table_matches_the_roles_the_code_knows(run_sql) -> None:
    names = [row["role_name"] for row in run_sql("SELECT role_name FROM roles ORDER BY role_id")]
    assert names == ["employee", "engineer", "admin"]
    assert set(names) == set(get_args(Role)) == tokens.ROLES


def test_a_new_user_is_an_employee(register, run_sql) -> None:
    user = register()
    [row] = run_sql(
        "SELECT r.role_name FROM users u JOIN roles r USING (role_id) WHERE u.user_id = %s",
        (user["user_id"],),
    )
    assert user["role"] == row["role_name"] == "employee"


def test_the_database_rejects_a_role_id_that_isnt_a_role(jane_user, run_sql) -> None:
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        run_sql("UPDATE users SET role_id = 999 WHERE user_id = %s", (jane_user["user_id"],))


def test_every_user_must_have_a_role(jane_user, set_role) -> None:
    with pytest.raises(psycopg.errors.NotNullViolation):
        set_role(jane_user["user_id"], "superuser")


def test_schema_moves_an_older_databases_role_text_into_role_id(
    client, api, user_with_role, run_sql
) -> None:
    users = [user_with_role(role) for role in ("employee", "engineer", "admin")]
    with db.transaction() as conn:
        conn.execute(OLD_USERS_SHAPE_SQL)
    assert "role" in _users_columns(run_sql) and "role_id" not in _users_columns(run_sql)

    # Run schema.sql twice: the first run migrates, the second must change nothing.
    for _ in range(2):
        with db.transaction() as conn:
            conn.execute(SCHEMA_SQL.read_text())

    assert "role_id" in _users_columns(run_sql) and "role" not in _users_columns(run_sql)
    # A token only works while its role matches the database, so each user keeping their
    # role through the migration is what lets their existing token still sign them in.
    for user in users:
        response = client.get(f"{api}/auth/me", headers=bearer(user))
        assert response.status_code == 200, response.text
        assert response.json()["role"] == user["role"]
