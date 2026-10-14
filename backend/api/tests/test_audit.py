"""Audit activity and Archives (admin): the audit log with its filters and diffs, and the archived records list."""

from datetime import date, datetime, timedelta

import pytest

from tests.conftest import SEED_ADMIN, SEED_EMPLOYEE, SEED_MANAGER, login

SEED_SUMMARIES = {
    "Created project Legacy server retirement",
    "Created team Server Ops with 3 members",
    "Approved milestone Inventory and dependency mapping",
    "Created employee account for Casey Nguyen",
    "Created project Asset inventory alignment",
    "Updated project budget from $110,000 to $120,000",
    "Submitted task Cut over DNS and load balancer for review",
    "Logged 6.5 h on Migrate file services to new cluster",
    "Added a note on milestone Workload migration",
}


def _auth(client, creds):
    return {"Authorization": f"Bearer {login(client, **creds)}"}


def _user_id(conn, username):
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE username = %s", (username,))
        return cur.fetchone()["id"]


def _audit_row(conn, entity_type, entity_id, action):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, created_at FROM audit_log WHERE entity_type = %s AND entity_id = %s AND action = %s ORDER BY id DESC LIMIT 1",
            (entity_type, entity_id, action),
        )
        return cur.fetchone()


def _by_field(changes):
    """The diff rows sorted by field name: jsonb does not keep key order, so the API's order is not fixed."""
    return sorted(changes, key=lambda c: c["field"])


def _same_instant(api_value, db_value):
    """The API's ISO string (may end in Z) and psycopg's datetime name the same moment."""
    return datetime.fromisoformat(api_value.replace("Z", "+00:00")) == db_value


def _new_project(ids, **overrides):
    today = date.today()
    return {
        "name": "Audit sample project",
        "description": "Created by the audit tests.",
        "department_id": ids["dept_inf"],
        "manager_id": ids["mgr001"],
        "start_date": today.isoformat(),
        "end_date": (today + timedelta(days=60)).isoformat(),
        "budget": 42000,
        **overrides,
    }


def _new_person(ids, **overrides):
    return {
        "first_name": "Quinn",
        "last_name": "Archer",
        "email": "quinn.archer@acme.test",
        "job_title": "Backup Operator",
        "role": "employee",
        "department_id": ids["dept_inf"],
        "manager_id": ids["mgr001"],
        "hourly_rate": 50,
        "password": "Welcome123!",
        **overrides,
    }


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    """Remove everything this module creates, so later test files see the seed as shipped."""
    from app.db import connection as db

    conn = db.get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT max(id) AS n FROM users")
        users = cur.fetchone()["n"]
        cur.execute("SELECT max(id) AS n FROM teams")
        teams = cur.fetchone()["n"]
        cur.execute("SELECT max(id) AS n FROM projects")
        projects = cur.fetchone()["n"]
        cur.execute("SELECT max(id) AS n FROM audit_log")
        audit_rows = cur.fetchone()["n"]
        cur.execute("SELECT id, next_project_seq FROM departments")
        counters = {r["id"]: r["next_project_seq"] for r in cur.fetchall()}
    yield
    conn.rollback()
    with conn.cursor() as cur:
        cur.execute("DELETE FROM time_entries WHERE task_id IN (SELECT t.id FROM tasks t JOIN milestones m ON m.id = t.milestone_id WHERE m.project_id > %s)", (projects,))
        cur.execute("DELETE FROM tasks WHERE milestone_id IN (SELECT id FROM milestones WHERE project_id > %s)", (projects,))
        cur.execute("DELETE FROM milestones WHERE project_id > %s", (projects,))
        cur.execute("DELETE FROM projects WHERE id > %s", (projects,))
        cur.execute("DELETE FROM teams WHERE id > %s", (teams,))
        cur.execute("DELETE FROM audit_log WHERE id > %s", (audit_rows,))
        cur.execute("DELETE FROM users WHERE id > %s", (users,))
        for dept_id, seq in counters.items():
            cur.execute("UPDATE departments SET next_project_seq = %s WHERE id = %s", (seq, dept_id))
    conn.commit()


@pytest.fixture
def ids(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM departments WHERE prefix = 'INF'")
        dept = cur.fetchone()["id"]
    return {
        "adm001": _user_id(conn, "adm001"),
        "mgr001": _user_id(conn, "mgr001"),
        "emp001": _user_id(conn, "emp001"),
        "dept_inf": dept,
    }


@pytest.fixture(scope="module")
def archived(client_module):
    """A project and a person created and archived by the admin, for the archive tests."""
    client, ids = client_module
    admin = _auth(client, SEED_ADMIN)
    project = client.post("/projects", json=_new_project(ids, name="Archive sample project"), headers=admin)
    assert project.status_code == 201, project.text
    person = client.post("/users", json=_new_person(ids), headers=admin)
    assert person.status_code == 201, person.text
    assert client.post(f"/projects/{project.json()['id']}/archive", headers=admin).status_code == 200
    assert client.post(f"/users/{person.json()['id']}/archive", headers=admin).status_code == 200
    return {"project": project.json(), "user": person.json()}


@pytest.fixture(scope="module")
def client_module():
    """A client plus seed ids for the module-scoped fixture above (the function fixtures cannot be reused there)."""
    from fastapi.testclient import TestClient

    from app.db import connection as db
    from app.main import app

    conn = db.get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM departments WHERE prefix = 'INF'")
        dept = cur.fetchone()["id"]
    return TestClient(app, raise_server_exceptions=False), {"dept_inf": dept, "mgr001": _user_id(conn, "mgr001")}


# --- Access ------------------------------------------------------------------------------------


@pytest.mark.parametrize("path", ["/audit", "/audit/1", "/archives"])
def test_audit_pages_are_admin_only(client, path):
    assert client.get(path).status_code == 401
    assert client.get(path, headers=_auth(client, SEED_MANAGER)).status_code == 403
    assert client.get(path, headers=_auth(client, SEED_EMPLOYEE)).status_code == 403
    assert client.get(path, headers=_auth(client, SEED_ADMIN)).status_code in (200, 404)


# --- Audit log: listing, ordering, pagination -----------------------------------------------


def test_audit_lists_seed_rows_newest_first(client):
    body = client.get("/audit", headers=_auth(client, SEED_ADMIN)).json()
    assert body["page"] == 1 and body["limit"] == 25 and body["total"] >= 9
    assert body["total"] == len(body["items"]) or len(body["items"]) == 25
    stamps = [e["created_at"] for e in body["items"]]
    assert stamps == sorted(stamps, reverse=True)
    assert SEED_SUMMARIES <= {e["summary"] for e in body["items"]}

    newest = body["items"][0]
    assert set(newest) == {"id", "created_at", "actor_id", "actor_name", "actor_role", "action", "entity_type", "entity_id", "entity_code", "summary"}
    note = next(e for e in body["items"] if e["summary"] == "Added a note on milestone Workload migration")
    assert note["actor_name"] == "Morgan Lee" and note["actor_role"] == "manager"
    assert note["action"] == "noted" and note["entity_type"] == "milestone" and note["entity_code"] == "INF-024"


def test_audit_pagination_and_total(client):
    admin = _auth(client, SEED_ADMIN)
    first = client.get("/audit?limit=4", headers=admin).json()
    second = client.get("/audit?limit=4&page=2", headers=admin).json()
    assert first["limit"] == 4 and len(first["items"]) == 4 and second["page"] == 2
    assert first["total"] == second["total"] >= 9
    assert not {e["id"] for e in first["items"]} & {e["id"] for e in second["items"]}
    assert first["items"][-1]["created_at"] >= second["items"][0]["created_at"]
    assert client.get("/audit?limit=4&page=99", headers=admin).json()["items"] == []

    assert client.get("/audit?limit=101", headers=admin).status_code == 400
    assert client.get("/audit?limit=0", headers=admin).status_code == 400
    assert client.get("/audit?page=0", headers=admin).status_code == 400


# --- Audit log: filters ---------------------------------------------------------------------


def test_audit_search_matches_summary_code_or_actor(client):
    admin = _auth(client, SEED_ADMIN)
    by_summary = client.get("/audit?q=casey", headers=admin).json()
    assert [e["summary"] for e in by_summary["items"]] == ["Created employee account for Casey Nguyen"]
    assert by_summary["total"] == 1

    by_code = client.get("/audit?q=inf-024", headers=admin).json()
    assert by_code["total"] >= 2 and {e["entity_code"] for e in by_code["items"]} == {"INF-024"}

    by_actor = client.get("/audit?q=Morgan%20Lee", headers=admin).json()
    assert by_actor["total"] >= 3 and {e["actor_name"] for e in by_actor["items"]} == {"Morgan Lee"}

    assert client.get("/audit?q=no-such-thing-anywhere", headers=admin).json()["total"] == 0


def test_audit_filters_by_action_entity_and_actor(client, ids):
    admin = _auth(client, SEED_ADMIN)
    created = client.get("/audit?action=created", headers=admin).json()
    assert created["total"] >= 4 and {e["action"] for e in created["items"]} == {"created"}

    tasks = client.get("/audit?entity_type=task", headers=admin).json()
    assert tasks["total"] == 2 and {e["entity_type"] for e in tasks["items"]} == {"task"}

    by_actor = client.get(f"/audit?actor_id={ids['mgr001']}", headers=admin).json()
    assert by_actor["total"] >= 3 and {e["actor_id"] for e in by_actor["items"]} == {ids["mgr001"]}

    combined = client.get(f"/audit?action=created&entity_type=project&actor_id={ids['adm001']}", headers=admin).json()
    assert {e["summary"] for e in combined["items"]} >= {"Created project Legacy server retirement", "Created project Asset inventory alignment"}
    assert client.get("/audit?action=exploded", headers=admin).json()["total"] == 0


def test_audit_filters_by_date_range(client):
    admin = _auth(client, SEED_ADMIN)
    today = date.today()
    old = client.get(f"/audit?to={(today - timedelta(days=30)).isoformat()}", headers=admin).json()
    assert {e["summary"] for e in old["items"]} == {"Created project Legacy server retirement", "Created team Server Ops with 3 members"}
    assert old["total"] == 2

    window = client.get(f"/audit?from={(today - timedelta(days=60)).isoformat()}&to={(today - timedelta(days=50)).isoformat()}", headers=admin).json()
    assert window["total"] == 2

    recent = client.get(f"/audit?from={(today - timedelta(days=30)).isoformat()}", headers=admin).json()
    assert recent["total"] >= 7
    assert all(e["created_at"][:10] >= (today - timedelta(days=30)).isoformat() for e in recent["items"])

    same_day = client.get(f"/audit?from={today.isoformat()}&to={today.isoformat()}", headers=admin).json()
    assert all(e["created_at"][:10] == today.isoformat() for e in same_day["items"])

    inverted = client.get(f"/audit?from={today.isoformat()}&to={(today - timedelta(days=1)).isoformat()}", headers=admin)
    assert inverted.status_code == 400
    assert inverted.json()["error"]["code"] == "VALIDATION_ERROR" and "to" in inverted.json()["error"]["fields"]
    assert client.get("/audit?from=not-a-date", headers=admin).status_code == 400


def test_audit_returns_the_filter_values(client, ids):
    body = client.get("/audit?limit=1", headers=_auth(client, SEED_ADMIN)).json()
    assert {"approved", "created", "logged_hours", "noted", "submitted", "updated"} <= set(body["actions"])
    assert body["actions"] == sorted(body["actions"])
    assert {"milestone", "project", "task", "team", "user"} <= set(body["entity_types"])
    assert body["entity_types"] == sorted(body["entity_types"])
    names = [a["name"] for a in body["actors"]]
    assert {"Ada Admin", "Morgan Lee", "Sam Rivera"} <= set(names)
    assert names == sorted(names) and len(names) == len(set(names))
    assert {"id": ids["adm001"], "name": "Ada Admin"} in body["actors"]
    # The lists describe the whole log, not the filtered page.
    filtered = client.get("/audit?action=noted", headers=_auth(client, SEED_ADMIN)).json()
    assert filtered["actions"] == body["actions"] and filtered["actors"] == body["actors"]


# --- Audit entry detail ---------------------------------------------------------------------


def test_audit_detail_lays_out_the_diff_of_an_update(client, conn, ids):
    admin = _auth(client, SEED_ADMIN)
    project = client.post("/projects", json=_new_project(ids), headers=admin).json()
    patched = client.patch(f"/projects/{project['id']}", json={"budget": 50000, "name": "Audit sample project v2"}, headers=admin)
    assert patched.status_code == 200, patched.text

    listed = client.get(f"/audit?action=updated&q={project['code']}", headers=admin).json()
    assert listed["total"] == 1
    entry = listed["items"][0]
    assert entry["actor_name"] == "Ada Admin" and entry["entity_code"] == project["code"]
    assert entry["summary"] in ("Updated project Audit sample project (budget, name)", "Updated project Audit sample project (name, budget)")

    detail = client.get(f"/audit/{entry['id']}", headers=admin).json()
    assert {k: detail[k] for k in entry} == entry
    assert detail["details"] == {"before": {"budget": 42000, "name": "Audit sample project"}, "after": {"budget": 50000, "name": "Audit sample project v2"}}
    assert _by_field(detail["changes"]) == [
        {"field": "budget", "before": 42000, "after": 50000},
        {"field": "name", "before": "Audit sample project", "after": "Audit sample project v2"},
    ]


def test_audit_detail_of_seed_rows_and_unknown_id(client):
    admin = _auth(client, SEED_ADMIN)
    rows = {e["summary"]: e for e in client.get("/audit?limit=100", headers=admin).json()["items"]}

    created = client.get(f"/audit/{rows['Created project Asset inventory alignment']['id']}", headers=admin).json()
    assert _by_field(created["changes"]) == [
        {"field": "budget", "before": None, "after": 45000},
        {"field": "manager", "before": None, "after": "mgr002"},
        {"field": "name", "before": None, "after": "Asset inventory alignment"},
    ]
    approved = client.get(f"/audit/{rows['Approved milestone Inventory and dependency mapping']['id']}", headers=admin).json()
    assert approved["changes"] == [{"field": "status", "before": "in_progress", "after": "completed"}]
    noted = client.get(f"/audit/{rows['Added a note on milestone Workload migration']['id']}", headers=admin).json()
    assert noted["details"] == {} and noted["changes"] == []

    missing = client.get("/audit/999999", headers=admin)
    assert missing.status_code == 404 and missing.json()["error"]["code"] == "NOT_FOUND"
    assert client.get("/audit/not-a-number", headers=admin).status_code == 400


# --- Archives --------------------------------------------------------------------------------


def test_archives_list_projects_and_users_together(client, conn, archived):
    admin = _auth(client, SEED_ADMIN)
    body = client.get("/archives", headers=admin).json()
    assert body["page"] == 1 and body["limit"] == 25
    assert body["total"] == body["projects"] + body["users"] and body["projects"] >= 1 and body["users"] >= 1
    stamps = [r["archived_at"] for r in body["items"]]
    assert stamps == sorted(stamps, reverse=True)

    project = next(r for r in body["items"] if r["type"] == "project" and r["id"] == archived["project"]["id"])
    assert project["code"] == archived["project"]["code"] and project["name"] == "Archive sample project"
    assert project["detail"] == "Infrastructure · Morgan Lee"
    assert project["archived_by"] == "Ada Admin"
    assert _same_instant(project["archived_at"], _audit_row(conn, "project", project["id"], "archived")["created_at"])

    user = next(r for r in body["items"] if r["type"] == "user" and r["id"] == archived["user"]["id"])
    assert user["code"] == f"USR-{archived['user']['id']:03d}" and user["name"] == "Quinn Archer"
    assert user["detail"] == "Employee · quinn.archer@acme.test"
    assert user["archived_by"] == "Ada Admin"
    assert _same_instant(user["archived_at"], _audit_row(conn, "user", user["id"], "archived")["created_at"])
    # The user was archived after the project, so it comes first.
    assert body["items"].index(user) < body["items"].index(project)

    # Active records never appear.
    assert not any(r["type"] == "project" and r["code"] == "INF-024" for r in body["items"])


def test_archives_type_filter_and_search(client, archived):
    admin = _auth(client, SEED_ADMIN)
    projects = client.get("/archives?type=project", headers=admin).json()
    assert {r["type"] for r in projects["items"]} == {"project"} and projects["total"] == projects["projects"]
    users = client.get("/archives?type=user", headers=admin).json()
    assert {r["type"] for r in users["items"]} == {"user"} and users["total"] == users["users"]
    assert client.get("/archives?type=team", headers=admin).status_code == 400

    by_code = client.get(f"/archives?q={archived['project']['code']}", headers=admin).json()
    assert [r["id"] for r in by_code["items"]] == [archived["project"]["id"]] and by_code["total"] == 1
    by_name = client.get("/archives?q=quinn", headers=admin).json()
    assert [(r["type"], r["id"]) for r in by_name["items"]] == [("user", archived["user"]["id"])]
    by_detail = client.get("/archives?q=backup%20operator", headers=admin).json()
    assert by_detail["total"] == 0  # job title is not part of the row; the detail is role and email
    by_email = client.get("/archives?q=acme.test&type=user", headers=admin).json()
    assert archived["user"]["id"] in [r["id"] for r in by_email["items"]]
    assert client.get("/archives?q=nothing-archived-like-this", headers=admin).json()["total"] == 0

    paged = client.get("/archives?limit=1", headers=admin).json()
    assert len(paged["items"]) == 1 and paged["total"] >= 2
    assert client.get("/archives?limit=1&page=99", headers=admin).json()["items"] == []
    assert client.get("/archives?limit=101", headers=admin).status_code == 400


def test_restored_records_leave_the_archives(client, archived):
    admin = _auth(client, SEED_ADMIN)
    before = client.get("/archives", headers=admin).json()

    assert client.post(f"/projects/{archived['project']['id']}/restore", headers=admin).status_code == 200
    after_project = client.get("/archives", headers=admin).json()
    assert archived["project"]["id"] not in [r["id"] for r in after_project["items"] if r["type"] == "project"]
    assert after_project["total"] == before["total"] - 1 and after_project["projects"] == before["projects"] - 1

    assert client.post(f"/users/{archived['user']['id']}/restore", headers=admin).status_code == 200
    after_user = client.get("/archives", headers=admin).json()
    assert archived["user"]["id"] not in [r["id"] for r in after_user["items"] if r["type"] == "user"]
    assert after_user["total"] == before["total"] - 2 and after_user["users"] == before["users"] - 1

    # Both restores are in the log and the project's archive entry shows the flag flipping.
    restored = client.get("/audit?action=restored", headers=admin).json()
    assert {e["summary"] for e in restored["items"]} >= {"Restored project Archive sample project", "Restored Quinn Archer"}
    archived_entry = client.get(f"/audit?action=archived&q={archived['project']['code']}", headers=admin).json()["items"][0]
    detail = client.get(f"/audit/{archived_entry['id']}", headers=admin).json()
    assert detail["changes"] == [{"field": "is_archived", "before": False, "after": True}]
