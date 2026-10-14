"""Manager reports: totals, hours by project, weekly labour cost, over-allocated people, planning note."""

from datetime import date, timedelta

import pytest

from tests.conftest import SEED_ADMIN, SEED_EMPLOYEE, SEED_MANAGER, login

MANAGER_2 = {"username": "mgr002", "password": "Manager123!"}
WEEKS = 5
CAPACITY = 40.0


def _auth(client, creds):
    return {"Authorization": f"Bearer {login(client, **creds)}"}


def _reports(client, creds=SEED_MANAGER):
    response = client.get("/manager/reports", headers=_auth(client, creds))
    assert response.status_code == 200, response.text
    return response.json()


def _user_id(conn, username):
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE username = %s", (username,))
        return cur.fetchone()["id"]


def _task_id(conn, title):
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM tasks WHERE title = %s", (title,))
        return cur.fetchone()["id"]


def _logged(conn, manager_id, first, last):
    """Hours and cost (hours x rate) logged on the manager's active projects between two dates."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT coalesce(sum(te.hours), 0)::float8 AS hours,
                   coalesce(sum(te.hours * u.hourly_rate), 0)::float8 AS cost
            FROM time_entries te
            JOIN users u ON u.id = te.user_id
            JOIN tasks t ON t.id = te.task_id
            JOIN milestones m ON m.id = t.milestone_id
            JOIN projects p ON p.id = m.project_id
            WHERE p.manager_id = %s AND p.status = 'active' AND NOT p.is_archived
              AND te.work_date BETWEEN %s AND %s
            """,
            (manager_id, first, last),
        )
        return cur.fetchone()


def _this_monday():
    today = date.today()
    return today - timedelta(days=today.weekday())


def _percent(part, whole):
    """Whole-number percentage, 0 when there is nothing to measure against (as the API does)."""
    return round(100 * part / whole) if whole else 0


def _active(projects):
    """GET /projects also lists closed projects; reports only cover active ones."""
    return [p for p in projects if p["status"] == "active" and not p["is_archived"]]


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    """Remove the time entries and the manager account this module creates."""
    from app.db import connection as db

    conn = db.get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT max(id) AS n FROM users")
        users = cur.fetchone()["n"]
        cur.execute("SELECT max(id) AS n FROM audit_log")
        audit_rows = cur.fetchone()["n"]
    yield
    conn.rollback()
    with conn.cursor() as cur:
        cur.execute("DELETE FROM time_entries WHERE note = 'reports test'")
        cur.execute("DELETE FROM audit_log WHERE id > %s", (audit_rows,))
        cur.execute("DELETE FROM users WHERE id > %s", (users,))
    conn.commit()


# --- Access -----------------------------------------------------------------------------------


def test_reports_is_manager_only(client):
    for account in (SEED_EMPLOYEE, SEED_ADMIN):
        response = client.get("/manager/reports", headers=_auth(client, account))
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "FORBIDDEN"
    response = client.get("/manager/reports")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_reports_week_is_the_current_monday_to_sunday(client):
    body = _reports(client)
    monday = _this_monday()
    assert body["week"]["start"] == monday.isoformat()
    assert body["week"]["end"] == (monday + timedelta(days=6)).isoformat()
    assert body["week"]["capacity_hours"] == CAPACITY


# --- Totals and projects agree with the Projects page and the Overview --------------------------


def test_totals_are_the_sums_over_the_projects_list(client):
    manager = _auth(client, SEED_MANAGER)
    body = _reports(client)
    projects = _active(client.get("/projects", headers=manager).json())
    totals = body["totals"]
    assert totals["projects"] == len(projects) >= 1
    assert totals["at_risk"] == sum(1 for p in projects if p["health"] == "at_risk")
    for field in ("budget", "planned_cost", "actual_cost", "planned_hours", "actual_hours"):
        assert totals[field] == pytest.approx(sum(p[field] for p in projects)), field
    assert totals["budget_remaining"] == pytest.approx(totals["budget"] - totals["actual_cost"])
    assert totals["hours_remaining"] == pytest.approx(max(totals["planned_hours"] - totals["actual_hours"], 0))
    assert totals["budget_used_percent"] == _percent(totals["actual_cost"], totals["budget"])
    assert totals["hours_used_percent"] == _percent(totals["actual_hours"], totals["planned_hours"])
    assert totals["actual_cost"] > 0 and totals["actual_hours"] > 0


def test_project_rows_match_the_projects_list(client):
    manager = _auth(client, SEED_MANAGER)
    body = _reports(client)
    listed = {p["code"]: p for p in _active(client.get("/projects", headers=manager).json())}
    assert [p["code"] for p in body["projects"]] == sorted(listed)
    for row in body["projects"]:
        project = listed[row["code"]]
        assert row["id"] == project["id"] and row["name"] == project["name"]
        assert row["health"] == project["health"] and row["department"] == project["department"]
        assert row["end_date"] == project["end_date"] and row["progress"] == project["progress"]
        for field in ("budget", "planned_cost", "actual_cost", "planned_hours", "actual_hours"):
            assert row[field] == pytest.approx(project[field]), field
        assert row["budget_used_percent"] == _percent(project["actual_cost"], project["budget"])
        assert row["hours_used_percent"] == _percent(project["actual_hours"], project["planned_hours"])


def test_figures_agree_with_the_manager_overview(client):
    body = _reports(client)
    overview = client.get("/manager/overview", headers=_auth(client, SEED_MANAGER)).json()
    assert body["totals"]["projects"] == overview["stats"]["active_projects"]
    assert body["totals"]["at_risk"] == overview["stats"]["at_risk"]
    focus = overview["focus"]
    row = next(p for p in body["projects"] if p["id"] == focus["id"])
    assert row["code"] == focus["code"] == "INF-024"
    assert row["health"] == focus["health"] and row["progress"] == focus["progress"]
    assert row["actual_cost"] == pytest.approx(focus["actual_cost"])
    assert row["planned_cost"] == pytest.approx(focus["planned_cost"])
    assert row["budget_used_percent"] == focus["budget_used_percent"]
    assert row["hours_used_percent"] == focus["hours_used_percent"]
    # Over-allocation uses the same people and hours as the Overview's capacity list.
    flagged = {p["name"] for p in overview["people"] if p["over_capacity"]}
    assert {p["name"] for p in body["over_allocated"]} == flagged


def test_other_manager_sees_only_their_own_project(client):
    body = _reports(client, MANAGER_2)
    assert [p["code"] for p in body["projects"]] == ["OPS-018"]
    assert body["totals"]["projects"] == 1
    assert body["projects"][0]["actual_cost"] == pytest.approx(body["totals"]["actual_cost"])


# --- Weekly labour cost --------------------------------------------------------------------------


def test_weekly_cost_covers_the_last_five_weeks_ending_now(client, conn):
    body = _reports(client)
    series = body["weekly_cost"]
    assert len(series) == WEEKS
    monday = _this_monday()
    starts = [date.fromisoformat(w["week_start"]) for w in series]
    assert all(s.weekday() == 0 for s in starts)
    assert starts == [monday - timedelta(weeks=WEEKS - 1 - i) for i in range(WEEKS)]

    manager_id = _user_id(conn, "mgr001")
    this_week = _logged(conn, manager_id, monday, monday + timedelta(days=6))
    assert this_week["hours"] > 0  # the seed logs hours in the current week
    assert series[-1]["hours"] == pytest.approx(this_week["hours"])
    assert series[-1]["cost"] == pytest.approx(this_week["cost"], abs=0.01)

    window = _logged(conn, manager_id, starts[0], monday + timedelta(days=6))
    assert sum(w["hours"] for w in series) == pytest.approx(window["hours"])
    assert sum(w["cost"] for w in series) == pytest.approx(window["cost"], abs=0.01 * WEEKS)
    for week in series:
        start = date.fromisoformat(week["week_start"])
        logged = _logged(conn, manager_id, start, start + timedelta(days=6))
        assert week["hours"] == pytest.approx(logged["hours"])
        assert week["cost"] == pytest.approx(logged["cost"], abs=0.01)


def test_weekly_cost_is_hours_times_rate(client, conn):
    """INF-024's hours this week are logged by emp001 (60/h) and emp003 (45/h)."""
    body = _reports(client)
    this_week = body["weekly_cost"][-1]
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT te.hours::float8 AS hours, u.hourly_rate::float8 AS rate
            FROM time_entries te
            JOIN users u ON u.id = te.user_id
            JOIN tasks t ON t.id = te.task_id
            JOIN milestones m ON m.id = t.milestone_id
            JOIN projects p ON p.id = m.project_id
            WHERE p.code = 'INF-024' AND te.work_date BETWEEN %s AND %s
            """,
            (this_week["week_start"], date.fromisoformat(this_week["week_start"]) + timedelta(days=6)),
        )
        entries = cur.fetchall()
    assert entries
    assert this_week["cost"] == pytest.approx(sum(e["hours"] * e["rate"] for e in entries), abs=0.01)


# --- Over-allocated people -----------------------------------------------------------------------


def test_over_allocated_lists_direct_reports_above_capacity(client, conn):
    assert _reports(client)["over_allocated"] == []  # nobody is above 40 h on the seed

    task = _task_id(conn, "Validate backups after migration")
    jordan = _user_id(conn, "emp003")
    before = next(p for p in client.get("/manager/overview", headers=_auth(client, SEED_MANAGER)).json()["people"] if p["id"] == jordan)
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO time_entries (task_id, user_id, work_date, hours, note) "
            "VALUES (%s, %s, current_date, 24, 'reports test'), (%s, %s, current_date, 17, 'reports test')",
            (task, jordan, task, jordan),
        )
    conn.commit()
    try:
        over = _reports(client)["over_allocated"]
        assert [p["name"] for p in over] == ["Jordan Okafor"]
        assert over[0]["id"] == jordan
        assert over[0]["hours_this_week"] == pytest.approx(before["hours_this_week"] + 41)
        assert over[0]["over_by"] == pytest.approx(over[0]["hours_this_week"] - CAPACITY)
        assert over[0]["over_by"] > 0
    finally:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM time_entries WHERE note = 'reports test'")
        conn.commit()
    assert _reports(client)["over_allocated"] == []


# --- Planning note -------------------------------------------------------------------------------


def test_attention_points_at_the_project_with_tasks(client):
    body = _reports(client)
    note = body["attention"]
    project = next(p for p in body["projects"] if p["code"] == "INF-024")
    assert project["progress"]["total"] > 0
    assert note["id"] == project["id"] and note["code"] == "INF-024"
    assert note["name"] == "Legacy server retirement" and note["health"] == project["health"]
    assert note["budget_used_percent"] == project["budget_used_percent"]
    assert note["delivery_percent"] == project["progress"]["percent"]
    assert note["budget_remaining"] == pytest.approx(project["budget"] - project["actual_cost"])
    assert note["hours_remaining"] == pytest.approx(max(project["planned_hours"] - project["actual_hours"], 0))

    other = _reports(client, MANAGER_2)
    assert other["attention"]["code"] == "OPS-018"


def test_attention_is_null_for_a_manager_without_projects(client, conn):
    admin = _auth(client, SEED_ADMIN)
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM departments WHERE prefix = 'INF'")
        department = cur.fetchone()["id"]
    created = client.post(
        "/users",
        json={
            "first_name": "Rowan",
            "last_name": "Pike",
            "email": "rowan.pike@acme.test",
            "job_title": "Programme Manager",
            "role": "manager",
            "department_id": department,
            "hourly_rate": 80,
            "password": "Welcome123!",
        },
        headers=admin,
    )
    assert created.status_code == 201, created.text

    body = _reports(client, {"username": created.json()["username"], "password": "Welcome123!"})
    assert body["projects"] == [] and body["attention"] is None
    assert body["over_allocated"] == []
    assert body["totals"] == {
        "projects": 0,
        "at_risk": 0,
        "budget": 0,
        "planned_cost": 0,
        "actual_cost": 0,
        "budget_remaining": 0,
        "budget_used_percent": 0,
        "planned_hours": 0,
        "actual_hours": 0,
        "hours_remaining": 0,
        "hours_used_percent": 0,
    }
    assert len(body["weekly_cost"]) == WEEKS
    assert all(w["hours"] == 0 and w["cost"] == 0 for w in body["weekly_cost"])
