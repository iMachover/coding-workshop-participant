"""Tests for the three Overview endpoints, against the seeded sample data."""

from contextlib import contextmanager
from datetime import date

import pytest

from app.overview.service import _display_status, current_week, health, manager_overview, progress
from tests.conftest import SEED_ADMIN, SEED_EMPLOYEE, SEED_MANAGER, login


def _get(client, path: str, username: str, password: str):
    token = login(client, username, password)
    return client.get(path, headers={"Authorization": f"Bearer {token}"})


# --- Calculations -----------------------------------------------------------------------------


def _project(**overrides):
    return {"planned_hours": 100.0, "actual_hours": 50.0, "milestone_overdue": False, "team_names": ["Platform"], **overrides}


def test_health_on_track_by_default():
    assert health(_project()) == "on_track"


def test_health_pending_without_a_team():
    assert health(_project(team_names=[])) == "pending"


def test_health_at_risk_without_a_team_when_hours_exceed_plan():
    assert health(_project(team_names=[], actual_hours=101.0)) == "at_risk"


def test_health_at_risk_when_hours_exceed_plan():
    assert health(_project(actual_hours=101.0)) == "at_risk"


def test_health_at_risk_when_active_milestone_overdue():
    assert health(_project(milestone_overdue=True)) == "at_risk"


def test_progress_handles_no_tasks():
    assert progress(0, 0).percent == 0
    assert progress(1, 3).percent == 33


def test_week_runs_monday_to_sunday():
    week = current_week(date(2026, 10, 15))  # a Thursday
    assert (week.start, week.end) == (date(2026, 10, 12), date(2026, 10, 18))


@pytest.mark.parametrize(
    ("task", "active", "expected"),
    [
        ({"status": "in_progress", "milestone_locked": False, "milestone_id": 1}, 1, "in_progress"),
        ({"status": "assigned", "milestone_locked": True, "milestone_id": 2}, 1, "blocked"),
        ({"status": "assigned", "milestone_locked": False, "milestone_id": 2}, 1, "queued"),
        ({"status": "assigned", "milestone_locked": False, "milestone_id": 1}, 1, "assigned"),
        ({"status": "assigned", "milestone_locked": False, "milestone_id": 2}, None, "assigned"),
    ],
)
def test_display_status(task, active, expected):
    assert _display_status(task, active) == expected


# --- Employee ---------------------------------------------------------------------------------


def test_employee_overview_shows_active_milestone_and_open_work(client):
    response = _get(client, "/me/overview", **SEED_EMPLOYEE)
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["stats"]["project_count"] == 1
    assert body["stats"]["departments"] == ["Infrastructure"]
    assert body["stats"]["tasks"] == {"completed": 1, "total": 3, "percent": 33}
    assert body["active_milestone"]["name"] == "Workload migration"
    assert body["active_milestone"]["project_code"] == "INF-024"
    assert body["active_milestone"]["next_milestone"]["locked"] is True

    # Completed work is left out; in-progress work comes first.
    assert [t["display_status"] for t in body["tasks"]] == ["in_progress", "assigned"]
    first = body["tasks"][0]
    assert first["actual_cost"] == first["actual_hours"] * 60  # emp001's hourly rate


def test_employee_without_started_work_sees_blocked_tasks(client):
    response = _get(client, "/me/overview", "emp003", "Employee123!")
    body = response.json()
    assert body["active_milestone"] is None
    statuses = {t["title"]: t["display_status"] for t in body["tasks"]}
    assert statuses["Validate backups after migration"] == "assigned"
    assert statuses["Wipe and certify drives"] == "blocked"


def test_employee_overview_is_employee_only(client):
    assert _get(client, "/me/overview", **SEED_MANAGER).status_code == 403


def test_overview_requires_token(client):
    assert client.get("/me/overview").status_code == 401


# --- Manager ----------------------------------------------------------------------------------


def test_manager_overview_focuses_on_own_project(client):
    response = _get(client, "/manager/overview", **SEED_MANAGER)
    assert response.status_code == 200, response.text
    body = response.json()

    assert [p["code"] for p in body["projects"]] == ["INF-024"]
    focus = body["focus"]
    assert focus["code"] == "INF-024"
    assert [m["locked"] for m in focus["milestones"]] == [False, False, True]
    assert focus["remaining_budget"] == focus["budget"] - focus["actual_cost"]

    assert body["stats"]["pending_approvals"] == 1
    assert body["review_queue"][0]["title"] == "Cut over DNS and load balancer"
    assert body["review_queue"][0]["employee_name"] == "Priya Natarajan"
    assert {p["name"] for p in body["people"]} == {"Sam Rivera", "Priya Natarajan", "Jordan Okafor"}


def test_manager_cannot_focus_on_another_managers_project(client, conn):
    other = conn.execute("SELECT id FROM projects WHERE code = 'OPS-018'").fetchone()["id"]
    response = _get(client, f"/manager/overview?project_id={other}", **SEED_MANAGER)
    assert response.status_code == 403


def test_manager_overview_costs_follow_hours_times_rate(client):
    # OPS-018: emp004 ($50/h) logged 20 h of 74 planned; one resource estimated at $600, no actual yet.
    body = _get(client, "/manager/overview", "mgr002", "Manager123!").json()
    focus = body["focus"]
    assert focus["code"] == "OPS-018"
    assert focus["actual_cost"] == 1000
    assert focus["planned_cost"] == 74 * 50 + 600


def test_manager_overview_is_manager_only(client):
    assert _get(client, "/manager/overview", **SEED_EMPLOYEE).status_code == 403


# --- Admin ------------------------------------------------------------------------------------


def test_admin_overview_lists_portfolio_managers_and_audit(client):
    response = _get(client, "/admin/overview", **SEED_ADMIN)
    assert response.status_code == 200, response.text
    body = response.json()

    assert {p["code"] for p in body["portfolio"]} >= {"INF-024", "OPS-018"}
    assert body["stats"]["managers"] == 2
    assert {m["name"] for m in body["managers"]} == {"Morgan Lee", "Taylor Brooks"}

    audit = body["recent_audit"]
    assert len(audit) == 4
    assert [a["created_at"] for a in audit] == sorted((a["created_at"] for a in audit), reverse=True)
    assert audit[0]["action"] == "noted"


def test_admin_overview_is_admin_only(client):
    assert _get(client, "/admin/overview", **SEED_MANAGER).status_code == 403


# --- Negative cases and business rules against changed data -----------------------------------
# Each test changes shared seed data inside `temporarily`, which always puts it back.


@contextmanager
def temporarily(conn, change_sql: str, restore_sql: str, params: tuple = (), restore_params: tuple = ()):
    """Apply a data change for the duration of a test, then restore it and commit."""
    conn.execute(change_sql, params)
    conn.commit()
    try:
        yield
    finally:
        conn.execute(restore_sql, restore_params)
        conn.commit()


@pytest.mark.parametrize("path", ["/me/overview", "/manager/overview", "/admin/overview"])
def test_every_overview_requires_token(client, path):
    response = client.get(path)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


@pytest.mark.parametrize(
    ("path", "account"),
    [
        ("/admin/overview", SEED_EMPLOYEE),
        ("/manager/overview", SEED_ADMIN),
        ("/me/overview", SEED_ADMIN),
    ],
)
def test_overview_forbids_other_roles(client, path, account):
    response = _get(client, path, **account)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


def test_manager_can_pick_own_project(client, conn):
    own = conn.execute("SELECT id FROM projects WHERE code = 'INF-024'").fetchone()["id"]
    response = _get(client, f"/manager/overview?project_id={own}", **SEED_MANAGER)
    assert response.status_code == 200
    assert response.json()["focus"]["id"] == own


def test_manager_project_id_must_be_a_number(client):
    response = _get(client, "/manager/overview?project_id=abc", **SEED_MANAGER)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert "project_id" in response.json()["error"]["fields"]


def test_unknown_project_id_is_forbidden(client):
    assert _get(client, "/manager/overview?project_id=999999", **SEED_MANAGER).status_code == 403


def test_submitted_work_marks_the_active_milestone(client):
    # emp002 has a submitted task and nothing in progress; the rack removal sits in a locked milestone.
    body = _get(client, "/me/overview", "emp002", "Employee123!").json()
    assert body["active_milestone"]["name"] == "Workload migration"
    assert body["stats"]["tasks_submitted"] == 1
    statuses = {t["title"]: t["display_status"] for t in body["tasks"]}
    assert statuses == {"Cut over DNS and load balancer": "submitted", "Remove racks and arrange recycling": "blocked"}


def test_employee_sees_only_own_hours_and_tasks(client):
    body = _get(client, "/me/overview", "emp004", "Employee123!").json()
    assert {t["project_code"] for t in body["tasks"]} == {"OPS-018"}
    assert body["stats"]["hourly_rate"] == 50
    assert body["snapshot"]["lifetime_hours"] == 20
    assert body["snapshot"]["lifetime_cost"] == 1000


def test_overdue_active_milestone_puts_project_at_risk(client, conn):
    with temporarily(
        conn,
        "UPDATE milestones SET projected_end_date = current_date - 1 WHERE name = 'Workload migration'",
        "UPDATE milestones SET projected_end_date = current_date + 21 WHERE name = 'Workload migration'",
    ):
        body = _get(client, "/admin/overview", **SEED_ADMIN).json()
        health_by_code = {p["code"]: p["health"] for p in body["portfolio"]}
        assert health_by_code == {"INF-024": "at_risk", "OPS-018": "on_track"}
        assert (body["stats"]["at_risk"], body["stats"]["on_track"]) == (1, 1)


def test_archived_project_disappears_from_every_overview(client, conn):
    with temporarily(
        conn,
        "UPDATE projects SET is_archived = TRUE WHERE code = 'OPS-018'",
        "UPDATE projects SET is_archived = FALSE WHERE code = 'OPS-018'",
    ):
        admin = _get(client, "/admin/overview", **SEED_ADMIN).json()
        assert [p["code"] for p in admin["portfolio"]] == ["INF-024"]
        manager = _get(client, "/manager/overview", "mgr002", "Manager123!").json()
        assert manager["focus"] is None
        assert manager["stats"]["active_projects"] == 0
        employee = _get(client, "/me/overview", "emp004", "Employee123!").json()
        assert employee["tasks"] == []
        assert employee["active_milestone"] is None


def test_closed_project_has_no_active_milestone_banner(client, conn):
    with temporarily(
        conn,
        "UPDATE projects SET status = 'closed' WHERE code = 'OPS-018'",
        "UPDATE projects SET status = 'active' WHERE code = 'OPS-018'",
    ):
        body = _get(client, "/me/overview", "emp004", "Employee123!").json()
        assert body["active_milestone"] is None
        assert body["stats"]["project_count"] == 0


def test_person_over_40_hours_is_flagged(client, conn):
    task = conn.execute("SELECT id FROM tasks WHERE title = 'Validate backups after migration'").fetchone()["id"]
    user = conn.execute("SELECT id FROM users WHERE username = 'emp003'").fetchone()["id"]
    with temporarily(
        conn,
        "INSERT INTO time_entries (task_id, user_id, work_date, hours, note) VALUES (%s, %s, current_date, 24, 'test'), "
        "(%s, %s, current_date, 17, 'test')",
        "DELETE FROM time_entries WHERE note = 'test' AND task_id = %s AND user_id = %s",
        (task, user, task, user),
        (task, user),
    ):
        body = _get(client, "/manager/overview", **SEED_MANAGER).json()
        jordan = next(p for p in body["people"] if p["name"] == "Jordan Okafor")
        assert jordan["hours_this_week"] == 41
        assert jordan["over_capacity"] is True


def test_manager_without_projects_gets_empty_overview(conn):
    admin = conn.execute("SELECT * FROM users WHERE username = 'adm001'").fetchone()
    overview = manager_overview(conn, admin, None)
    assert overview.focus is None
    assert overview.projects == []
    assert overview.review_queue == []
    assert overview.people == []
