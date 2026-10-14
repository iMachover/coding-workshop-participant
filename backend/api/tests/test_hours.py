"""My hours: the employee's ledger, logging hours after the work, corrections and removals (EMPLOYEE.md §2, §7)."""

from datetime import date, timedelta

import pytest

from tests.conftest import SEED_ADMIN, SEED_EMPLOYEE, SEED_MANAGER, login

MANAGER_2 = {"username": "mgr002", "password": "Manager123!"}
EMPLOYEE_2 = {"username": "emp002", "password": "Employee123!"}
EMPLOYEE_3 = {"username": "emp003", "password": "Employee123!"}
EMPLOYEE_4 = {"username": "emp004", "password": "Employee123!"}

IN_PROGRESS = "Migrate file services to new cluster"  # emp001, 5 seeded entries
ASSIGNED = "Update runbooks for migrated services"  # emp001, never started
COMPLETED = "Catalogue legacy servers"  # emp001, completed, 3 seeded entries
SUBMITTED = "Cut over DNS and load balancer"  # emp002, submitted, 3 seeded entries
OPS_TASK = "Scan asset tags in datacenter A"  # emp004, in progress on OPS-018


def _auth(client, creds):
    return {"Authorization": f"Bearer {login(client, **creds)}"}


def _task_id(conn, title):
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM tasks WHERE title = %s", (title,))
        return cur.fetchone()["id"]


def _user_id(conn, username):
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE username = %s", (username,))
        return cur.fetchone()["id"]


def _seeded_entry(conn, title):
    """The id of one seeded entry on a task (the newest)."""
    with conn.cursor() as cur:
        cur.execute("SELECT te.id FROM time_entries te JOIN tasks t ON t.id = te.task_id WHERE t.title = %s ORDER BY te.work_date DESC, te.id DESC LIMIT 1", (title,))
        return cur.fetchone()["id"]


def _hours(conn, username, start=None, end=None):
    """Hours the person has in the database, optionally only between two dates."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT coalesce(sum(hours), 0)::float8 AS h FROM time_entries WHERE user_id = %s AND (%s::date IS NULL OR work_date BETWEEN %s AND %s)",
            (_user_id(conn, username), start, start, end),
        )
        return cur.fetchone()["h"]


def _audit(conn, entity_type, entity_id):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT action, summary, details FROM audit_log WHERE entity_type = %s AND entity_id = %s ORDER BY id",
            (entity_type, entity_id),
        )
        return cur.fetchall()


def _set(conn, sql, params=()):
    with conn.cursor() as cur:
        cur.execute(sql, params)
    conn.commit()


def _week():
    monday = date.today() - timedelta(days=date.today().weekday())
    return monday, monday + timedelta(days=6)


def _last_weekday():
    """The most recent weekday before today: the seed always logged hours on it."""
    day = date.today() - timedelta(days=1)
    while day.weekday() >= 5:
        day -= timedelta(days=1)
    return day


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    """Remove every entry and audit row this module adds, so later test files see the seed as shipped."""
    from app.db import connection as db

    conn = db.get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT max(id) AS n FROM time_entries")
        entries = cur.fetchone()["n"]
        cur.execute("SELECT max(id) AS n FROM audit_log")
        audit_rows = cur.fetchone()["n"]
    yield
    conn.rollback()
    with conn.cursor() as cur:
        cur.execute("DELETE FROM time_entries WHERE id > %s", (entries,))
        cur.execute("DELETE FROM audit_log WHERE id > %s", (audit_rows,))
    conn.commit()


@pytest.fixture
def log(client, conn):
    """Log hours as emp001 on the in-progress task; whatever is created is removed afterwards."""
    created = []
    headers = _auth(client, SEED_EMPLOYEE)

    def _log(hours=2, work_date=None, note="Cluster checks", task=IN_PROGRESS, status=201):
        response = client.post(
            f"/tasks/{_task_id(conn, task)}/time-entries",
            json={"work_date": (work_date or date.today()).isoformat(), "hours": hours, "note": note},
            headers=headers,
        )
        assert response.status_code == status, response.text
        if status == 201:
            created.append(response.json()["id"])
        return response

    yield _log
    conn.rollback()
    with conn.cursor() as cur:
        cur.execute("DELETE FROM time_entries WHERE id = ANY(%s)", (created,))
    conn.commit()


# --- The ledger -------------------------------------------------------------------------------


def test_ledger_requires_an_employee(client):
    assert client.get("/me/time-entries").status_code == 401
    assert client.get("/me/time-entries", headers=_auth(client, SEED_MANAGER)).status_code == 403
    assert client.get("/me/time-entries", headers=_auth(client, SEED_ADMIN)).status_code == 403


def test_ledger_defaults_to_this_week(client, conn):
    monday, sunday = _week()
    body = client.get("/me/time-entries", headers=_auth(client, SEED_EMPLOYEE)).json()
    assert body["week"] == {"start": monday.isoformat(), "end": sunday.isoformat(), "capacity_hours": 40}
    assert body["range_start"] == monday.isoformat() and body["range_end"] == sunday.isoformat()
    assert all(monday.isoformat() <= e["work_date"] <= sunday.isoformat() for e in body["entries"])
    assert [e["work_date"] for e in body["entries"]] == sorted((e["work_date"] for e in body["entries"]), reverse=True)

    week_hours = _hours(conn, "emp001", monday, sunday)
    assert body["range_hours"] == week_hours == body["hours_this_week"]
    assert body["hourly_rate"] == 60 and body["cost_this_week"] == pytest.approx(week_hours * 60)
    assert body["available_hours"] == max(40 - week_hours, 0)
    assert body["lifetime_hours"] == _hours(conn, "emp001") == 51
    assert body["lifetime_cost"] == pytest.approx(51 * 60)
    # Only tasks in progress or submitted on a live project take hours.
    assert [t["title"] for t in body["loggable_tasks"]] == [IN_PROGRESS]
    assert body["loggable_tasks"][0]["status"] == "in_progress" and body["loggable_tasks"][0]["project_code"] == "INF-024"


def test_ledger_explicit_range(client, conn):
    headers = _auth(client, SEED_EMPLOYEE)
    monday, _ = _week()
    start, end = monday - timedelta(days=28), monday - timedelta(days=1)
    body = client.get(f"/me/time-entries?from={start}&to={end}", headers=headers).json()
    assert body["range_start"] == start.isoformat() and body["range_end"] == end.isoformat()
    assert body["range_hours"] == _hours(conn, "emp001", start, end) > 0
    assert body["range_cost"] == pytest.approx(body["range_hours"] * 60)
    assert all(start.isoformat() <= e["work_date"] <= end.isoformat() for e in body["entries"])
    # The week's figures do not move with the range.
    assert body["hours_this_week"] == _hours(conn, "emp001", *_week())
    # `from` alone keeps a week-long range.
    alone = client.get(f"/me/time-entries?from={start}", headers=headers).json()
    assert alone["range_end"] == (start + timedelta(days=6)).isoformat()
    # Every entry carries its task, project, cost at my rate and whether I may still change it.
    entry = body["entries"][0]
    assert entry["user_name"] == "Sam Rivera" and entry["project_code"] == "INF-024"
    assert entry["cost"] == pytest.approx(entry["hours"] * 60)
    assert {"task_code", "task_title", "task_status", "project_name", "editable", "note"} <= entry.keys()


def test_ledger_range_validation(client):
    headers = _auth(client, SEED_EMPLOYEE)
    backwards = client.get("/me/time-entries?from=2026-03-10&to=2026-03-01", headers=headers)
    assert backwards.status_code == 400 and "to" in backwards.json()["error"]["fields"]
    too_long = client.get("/me/time-entries?from=2026-01-01&to=2026-12-31", headers=headers)
    assert too_long.status_code == 400 and "92" in too_long.json()["error"]["fields"]["to"]
    garbage = client.get("/me/time-entries?from=yesterday", headers=headers)
    assert garbage.status_code == 400 and "from" in garbage.json()["error"]["fields"]


def test_only_entries_on_open_tasks_are_editable(client, conn):
    monday, _ = _week()
    body = client.get(f"/me/time-entries?from={monday - timedelta(days=60)}&to={monday + timedelta(days=6)}", headers=_auth(client, SEED_EMPLOYEE)).json()
    by_task = {}
    for e in body["entries"]:
        by_task.setdefault(e["task_title"], set()).add(e["editable"])
    assert by_task[IN_PROGRESS] == {True}
    assert by_task[COMPLETED] == {False}


# --- Logging hours ----------------------------------------------------------------------------


def test_employee_logs_hours_on_a_task_in_progress(client, conn, log):
    task = _task_id(conn, IN_PROGRESS)
    before = client.get("/me/time-entries", headers=_auth(client, SEED_EMPLOYEE)).json()
    body = log(hours=2.5, note="  Checked the new cluster  ").json()
    assert body["task_id"] == task and body["task_code"].startswith("TSK-")
    assert body["work_date"] == date.today().isoformat() and body["hours"] == 2.5
    assert body["note"] == "Checked the new cluster" and body["cost"] == 150 and body["editable"] is True
    assert body["user_name"] == "Sam Rivera" and body["task_status"] == "in_progress"

    row = _audit(conn, "task", task)[-1]
    assert row["action"] == "logged_hours" and "2.5 h" in row["summary"]
    assert row["details"]["after"] == {"entry_id": body["id"], "work_date": body["work_date"], "hours": 2.5, "note": "Checked the new cluster"}

    after = client.get("/me/time-entries", headers=_auth(client, SEED_EMPLOYEE)).json()
    assert after["hours_this_week"] == before["hours_this_week"] + 2.5
    assert after["lifetime_hours"] == before["lifetime_hours"] + 2.5
    assert after["available_hours"] == max(40 - after["hours_this_week"], 0)
    assert after["entries"][0]["id"] == body["id"]  # today is the newest day in the week


def test_blank_note_is_stored_as_none(client, log):
    assert log(hours=1, note="   ").json()["note"] is None
    assert log(hours=1, note=None).json()["note"] is None


def test_hours_go_on_submitted_tasks_too(client, conn):
    task = _task_id(conn, SUBMITTED)
    headers = _auth(client, EMPLOYEE_2)
    response = client.post(f"/tasks/{task}/time-entries", json={"work_date": date.today().isoformat(), "hours": 1}, headers=headers)
    assert response.status_code == 201, response.text
    assert response.json()["task_status"] == "submitted" and response.json()["editable"] is True
    assert client.delete(f"/time-entries/{response.json()['id']}", headers=headers).status_code == 204


def test_only_the_assigned_employee_logs_hours(client, conn):
    task = _task_id(conn, IN_PROGRESS)
    payload = {"work_date": date.today().isoformat(), "hours": 1}
    assert client.post(f"/tasks/{task}/time-entries", json=payload).status_code == 401
    assert client.post(f"/tasks/{task}/time-entries", json=payload, headers=_auth(client, SEED_MANAGER)).status_code == 403
    assert client.post(f"/tasks/{task}/time-entries", json=payload, headers=_auth(client, SEED_ADMIN)).status_code == 403
    assert client.post(f"/tasks/{task}/time-entries", json=payload, headers=_auth(client, EMPLOYEE_2)).status_code == 404
    assert client.post("/tasks/999999/time-entries", json=payload, headers=_auth(client, SEED_EMPLOYEE)).status_code == 404


def test_task_must_be_started_and_not_completed(client, log):
    refused = log(task=ASSIGNED, status=409)
    assert "Start the task" in refused.json()["error"]["message"]
    refused = log(task=COMPLETED, status=409)
    assert "completed" in refused.json()["error"]["message"]
    # emp003 has nothing started, so nothing to log on.
    body = client.get("/me/time-entries", headers=_auth(client, EMPLOYEE_3)).json()
    assert body["loggable_tasks"] == []


def test_closed_or_archived_project_takes_no_hours(client, conn):
    task = _task_id(conn, OPS_TASK)
    headers = _auth(client, EMPLOYEE_4)
    payload = {"work_date": date.today().isoformat(), "hours": 1}
    try:
        _set(conn, "UPDATE projects SET status = 'closed' WHERE code = 'OPS-018'")
        closed = client.post(f"/tasks/{task}/time-entries", json=payload, headers=headers)
        assert closed.status_code == 409 and "closed" in closed.json()["error"]["message"]
        assert client.get("/me/time-entries", headers=headers).json()["loggable_tasks"] == []
        _set(conn, "UPDATE projects SET status = 'active', is_archived = TRUE WHERE code = 'OPS-018'")
        assert client.post(f"/tasks/{task}/time-entries", json=payload, headers=headers).status_code == 409
    finally:
        _set(conn, "UPDATE projects SET status = 'active', is_archived = FALSE WHERE code = 'OPS-018'")
    logged = client.post(f"/tasks/{task}/time-entries", json=payload, headers=headers)
    assert logged.status_code == 201
    assert client.delete(f"/time-entries/{logged.json()['id']}", headers=headers).status_code == 204


def test_hours_are_logged_after_the_work(client, log):
    refused = log(work_date=date.today() + timedelta(days=1), status=400)
    assert "future" in refused.json()["error"]["fields"]["work_date"]


@pytest.mark.parametrize("hours", [0, -1, 24.5, "lots"])
def test_hours_must_be_between_zero_and_twenty_four(client, log, hours):
    assert "hours" in log(hours=hours, status=400).json()["error"]["fields"]


def test_missing_date_is_a_validation_error(client, conn):
    response = client.post(f"/tasks/{_task_id(conn, IN_PROGRESS)}/time-entries", json={"hours": 1}, headers=_auth(client, SEED_EMPLOYEE))
    assert response.status_code == 400 and "work_date" in response.json()["error"]["fields"]


def test_a_day_holds_at_most_twenty_four_hours(client, log):
    log(hours=20)
    refused = log(hours=4.5, status=400)
    assert "24.5 h" in refused.json()["error"]["fields"]["hours"] and "24 h" in refused.json()["error"]["fields"]["hours"]
    log(hours=4)  # exactly 24 is fine
    assert "hours" in log(hours=0.25, status=400).json()["error"]["fields"]


# --- Correcting and removing ------------------------------------------------------------------


def test_employee_corrects_own_entry(client, conn, log):
    task = _task_id(conn, IN_PROGRESS)
    entry = log(hours=2, note="Draft").json()
    headers = _auth(client, SEED_EMPLOYEE)
    yesterday = date.today() - timedelta(days=1)

    corrected = client.patch(f"/time-entries/{entry['id']}", json={"hours": 3, "note": "  Final  "}, headers=headers)
    assert corrected.status_code == 200, corrected.text
    assert corrected.json()["hours"] == 3 and corrected.json()["note"] == "Final" and corrected.json()["cost"] == 180
    row = _audit(conn, "task", task)[-1]
    assert row["action"] == "updated" and row["details"]["entry_id"] == entry["id"]
    assert row["details"]["before"] == {"hours": 2, "note": "Draft"} and row["details"]["after"] == {"hours": 3, "note": "Final"}

    moved = client.patch(f"/time-entries/{entry['id']}", json={"work_date": yesterday.isoformat()}, headers=headers)
    assert moved.status_code == 200 and moved.json()["work_date"] == yesterday.isoformat()
    assert _audit(conn, "task", task)[-1]["details"]["after"] == {"work_date": yesterday.isoformat()}

    # Sending the same values again changes nothing and leaves no audit row.
    count = len(_audit(conn, "task", task))
    same = client.patch(f"/time-entries/{entry['id']}", json={"hours": 3, "note": "Final", "work_date": yesterday.isoformat()}, headers=headers)
    assert same.status_code == 200 and same.json()["hours"] == 3
    assert client.patch(f"/time-entries/{entry['id']}", json={}, headers=headers).status_code == 200
    assert len(_audit(conn, "task", task)) == count


def test_correction_validation(client, conn, log):
    first = log(hours=20).json()
    second = log(hours=2).json()
    headers = _auth(client, SEED_EMPLOYEE)
    entry = f"/time-entries/{second['id']}"
    future = client.patch(entry, json={"work_date": (date.today() + timedelta(days=1)).isoformat()}, headers=headers)
    assert future.status_code == 400 and "work_date" in future.json()["error"]["fields"]
    assert client.patch(entry, json={"hours": 0}, headers=headers).status_code == 400
    assert client.patch(entry, json={"hours": 25}, headers=headers).status_code == 400
    assert client.patch(entry, json={"note": "x" * 501}, headers=headers).status_code == 400
    # The day cap counts the other entries, not the one being corrected.
    over = client.patch(entry, json={"hours": 4.5}, headers=headers)
    assert over.status_code == 400 and "hours" in over.json()["error"]["fields"]
    assert client.patch(entry, json={"hours": 4}, headers=headers).status_code == 200
    assert client.patch(f"/time-entries/{first['id']}", json={"hours": 20}, headers=headers).status_code == 200
    # Moving the entry onto a day that would overflow is refused too (the seed logged 6.5 h on the last weekday).
    assert client.patch(entry, json={"hours": 24}, headers=headers).status_code == 400
    assert client.patch(entry, json={"work_date": _last_weekday().isoformat(), "hours": 18}, headers=headers).status_code == 400
    assert client.patch(entry, json={"work_date": _last_weekday().isoformat(), "hours": 17.5}, headers=headers).status_code == 200


def test_entries_on_completed_tasks_are_final(client, conn):
    entry = _seeded_entry(conn, COMPLETED)
    headers = _auth(client, SEED_EMPLOYEE)
    refused = client.patch(f"/time-entries/{entry}", json={"hours": 1}, headers=headers)
    assert refused.status_code == 409 and "completed" in refused.json()["error"]["message"]
    assert client.delete(f"/time-entries/{entry}", headers=headers).status_code == 409


def test_entries_on_closed_projects_are_frozen(client, conn):
    entry = _seeded_entry(conn, OPS_TASK)
    headers = _auth(client, EMPLOYEE_4)
    try:
        _set(conn, "UPDATE projects SET status = 'closed' WHERE code = 'OPS-018'")
        assert client.patch(f"/time-entries/{entry}", json={"hours": 1}, headers=headers).status_code == 409
        assert client.delete(f"/time-entries/{entry}", headers=headers).status_code == 409
        assert client.get("/me/time-entries?from=2000-01-01&to=2000-03-01", headers=headers).status_code == 200
        ledger = client.get(f"/tasks/{_task_id(conn, OPS_TASK)}/time-entries", headers=headers).json()
        assert ledger and all(e["editable"] is False for e in ledger)
    finally:
        _set(conn, "UPDATE projects SET status = 'active' WHERE code = 'OPS-018'")


def test_employee_cannot_touch_someone_elses_entry(client, conn, log):
    entry = log().json()["id"]
    other = _auth(client, EMPLOYEE_2)
    assert client.patch(f"/time-entries/{entry}", json={"hours": 1}, headers=other).status_code == 404
    assert client.delete(f"/time-entries/{entry}", headers=other).status_code == 404
    seeded = _seeded_entry(conn, SUBMITTED)  # emp002's
    assert client.patch(f"/time-entries/{seeded}", json={"hours": 1}, headers=_auth(client, SEED_EMPLOYEE)).status_code == 404
    assert client.delete(f"/time-entries/{seeded}", headers=_auth(client, SEED_EMPLOYEE)).status_code == 404
    assert client.patch("/time-entries/999999", json={"hours": 1}, headers=_auth(client, SEED_EMPLOYEE)).status_code == 404


def test_only_employees_correct_or_remove_entries(client, log):
    entry = log().json()["id"]
    for creds in (SEED_MANAGER, SEED_ADMIN):
        assert client.patch(f"/time-entries/{entry}", json={"hours": 1}, headers=_auth(client, creds)).status_code == 403
        assert client.delete(f"/time-entries/{entry}", headers=_auth(client, creds)).status_code == 403
    assert client.patch(f"/time-entries/{entry}", json={"hours": 1}).status_code == 401
    assert client.delete(f"/time-entries/{entry}").status_code == 401


def test_employee_removes_own_entry(client, conn, log):
    task = _task_id(conn, IN_PROGRESS)
    headers = _auth(client, SEED_EMPLOYEE)
    entry = log(hours=1.5, note="Oops").json()
    before = client.get("/me/time-entries", headers=headers).json()["hours_this_week"]

    removed = client.delete(f"/time-entries/{entry['id']}", headers=headers)
    assert removed.status_code == 204 and removed.content == b""
    row = _audit(conn, "task", task)[-1]
    assert row["action"] == "deleted" and "1.5 h" in row["summary"]
    assert row["details"]["before"] == {"entry_id": entry["id"], "work_date": entry["work_date"], "hours": 1.5, "note": "Oops"}

    after = client.get("/me/time-entries", headers=headers).json()
    assert after["hours_this_week"] == before - 1.5
    assert entry["id"] not in {e["id"] for e in after["entries"]}
    assert client.delete(f"/time-entries/{entry['id']}", headers=headers).status_code == 404
    assert client.patch(f"/time-entries/{entry['id']}", json={"hours": 1}, headers=headers).status_code == 404


# --- Entries on a task, per role --------------------------------------------------------------


def test_employee_sees_own_entries_on_own_task(client, conn):
    task = _task_id(conn, IN_PROGRESS)
    rows = client.get(f"/tasks/{task}/time-entries", headers=_auth(client, SEED_EMPLOYEE)).json()
    assert len(rows) == 5 and sum(r["hours"] for r in rows) == 33
    assert {r["user_name"] for r in rows} == {"Sam Rivera"} and all(r["editable"] for r in rows)
    assert [r["work_date"] for r in rows] == sorted((r["work_date"] for r in rows), reverse=True)
    assert client.get(f"/tasks/{task}/time-entries").status_code == 401
    assert client.get(f"/tasks/{task}/time-entries", headers=_auth(client, EMPLOYEE_2)).status_code == 404
    assert client.get("/tasks/999999/time-entries", headers=_auth(client, SEED_EMPLOYEE)).status_code == 404
    # A task of mine without hours is an empty list, not an error.
    assert client.get(f"/tasks/{_task_id(conn, ASSIGNED)}/time-entries", headers=_auth(client, SEED_EMPLOYEE)).json() == []


def test_manager_sees_every_entry_on_own_projects_only(client, conn):
    task = _task_id(conn, SUBMITTED)  # emp002's, on INF-024
    rows = client.get(f"/tasks/{task}/time-entries", headers=_auth(client, SEED_MANAGER)).json()
    assert len(rows) == 3 and {r["user_name"] for r in rows} == {"Priya Natarajan"}
    assert all(r["editable"] is False for r in rows) and all(r["cost"] > 0 for r in rows)
    assert client.get(f"/tasks/{task}/time-entries", headers=_auth(client, MANAGER_2)).status_code == 404
    ops = _task_id(conn, OPS_TASK)
    assert len(client.get(f"/tasks/{ops}/time-entries", headers=_auth(client, MANAGER_2)).json()) == 4
    assert client.get(f"/tasks/{ops}/time-entries", headers=_auth(client, SEED_MANAGER)).status_code == 404


def test_admin_reads_entries_on_any_task(client, conn):
    headers = _auth(client, SEED_ADMIN)
    for title, count in ((IN_PROGRESS, 5), (SUBMITTED, 3), (OPS_TASK, 4), (ASSIGNED, 0)):
        rows = client.get(f"/tasks/{_task_id(conn, title)}/time-entries", headers=headers).json()
        assert len(rows) == count and all(r["editable"] is False for r in rows)
