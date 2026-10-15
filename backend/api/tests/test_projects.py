"""Projects API: role scoping, create / update / archive rules and the audit trail."""

from datetime import date, timedelta

import pytest

from tests.conftest import SEED_ADMIN, SEED_EMPLOYEE, SEED_MANAGER, login

MANAGER_2 = {"username": "mgr002", "password": "Manager123!"}
EMPLOYEE_4 = {"username": "emp004", "password": "Employee123!"}


def _auth(client, creds):
    return {"Authorization": f"Bearer {login(client, **creds)}"}


def _id(conn, table, column, value):
    with conn.cursor() as cur:
        cur.execute(f"SELECT id FROM {table} WHERE {column} = %s", (value,))  # nosec B608 - test helper
        return cur.fetchone()["id"]


def _audit_rows(conn, entity_id, action=None):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT action, summary, details FROM audit_log WHERE entity_type = 'project' AND entity_id = %s "
            "AND (%s::text IS NULL OR action = %s) ORDER BY id",
            (entity_id, action, action),
        )
        return cur.fetchall()


@pytest.fixture
def ids(conn):
    """Seed ids the tests refer to."""
    return {
        "inf": _id(conn, "projects", "code", "INF-024"),
        "ops": _id(conn, "projects", "code", "OPS-018"),
        "mgr001": _id(conn, "users", "username", "mgr001"),
        "mgr002": _id(conn, "users", "username", "mgr002"),
        "emp001": _id(conn, "users", "username", "emp001"),
        "dept_inf": _id(conn, "departments", "prefix", "INF"),
    }


def _new_project(ids, **overrides):
    today = date.today()
    return {
        "name": "Network segmentation",
        "description": "Split the flat network into zones.",
        "department_id": ids["dept_inf"],
        "manager_id": ids["mgr001"],
        "start_date": today.isoformat(),
        "end_date": (today + timedelta(days=90)).isoformat(),
        "budget": 42000,
        **overrides,
    }


# --- Listing and scoping ----------------------------------------------------------------------


def test_list_requires_token(client):
    assert client.get("/projects").status_code == 401


def test_admin_lists_every_active_project(client):
    response = client.get("/projects", headers=_auth(client, SEED_ADMIN))
    assert response.status_code == 200, response.text
    codes = [p["code"] for p in response.json()]
    assert codes == ["INF-024", "OPS-018"]
    first = response.json()[0]
    assert first["health"] in ("on_track", "at_risk", "pending")
    assert first["mine"] is None
    assert first["progress"]["total"] > 0
    assert first["team_names"] == ["Server Ops"]


def test_manager_lists_only_own_projects(client):
    codes = [p["code"] for p in client.get("/projects", headers=_auth(client, SEED_MANAGER)).json()]
    assert codes == ["INF-024"]
    codes = [p["code"] for p in client.get("/projects", headers=_auth(client, MANAGER_2)).json()]
    assert codes == ["OPS-018"]


def test_employee_lists_joined_projects_with_own_figures(client):
    rows = client.get("/projects", headers=_auth(client, SEED_EMPLOYEE)).json()
    assert [p["code"] for p in rows] == ["INF-024"]
    mine = rows[0]["mine"]
    assert mine["planned_hours"] > 0
    assert mine["actual_cost"] == pytest.approx(mine["actual_hours"] * 60)  # emp001 earns $60/h
    # /me/projects is the EMPLOYEE.md alias.
    assert client.get("/me/projects", headers=_auth(client, SEED_EMPLOYEE)).json() == rows


def test_search_matches_code_name_or_manager(client):
    headers = _auth(client, SEED_ADMIN)
    assert [p["code"] for p in client.get("/projects?q=ops-0", headers=headers).json()] == ["OPS-018"]
    assert [p["code"] for p in client.get("/projects?q=legacy", headers=headers).json()] == ["INF-024"]
    assert client.get("/projects?q=nothing-like-this", headers=headers).json() == []


def test_detail_includes_milestones_and_teams(client, ids):
    body = client.get(f"/projects/{ids['inf']}", headers=_auth(client, SEED_MANAGER)).json()
    assert body["code"] == "INF-024"
    assert body["team_names"] == ["Server Ops"]
    assert [m["sequence"] for m in body["milestones"]] == [1, 2, 3]
    assert body["milestones"][2]["locked"] is True


def test_detail_outside_scope_is_not_found(client, ids):
    assert client.get(f"/projects/{ids['ops']}", headers=_auth(client, SEED_MANAGER)).status_code == 404
    assert client.get(f"/projects/{ids['ops']}", headers=_auth(client, SEED_EMPLOYEE)).status_code == 404
    assert client.get("/projects/999999", headers=_auth(client, SEED_ADMIN)).status_code == 404


def test_options_are_admin_only(client):
    body = client.get("/projects/options", headers=_auth(client, SEED_ADMIN)).json()
    assert {m["name"] for m in body["managers"]} >= {"Morgan Lee", "Taylor Brooks"}
    assert {d["prefix"] for d in body["departments"]} == {"INF", "OPS"}
    assert client.get("/projects/options", headers=_auth(client, SEED_MANAGER)).status_code == 403


# --- Create -----------------------------------------------------------------------------------


def test_admin_creates_project_with_generated_code_and_audit(client, conn, ids):
    response = client.post("/projects", json=_new_project(ids), headers=_auth(client, SEED_ADMIN))
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["code"] == "INF-025"  # the seed left INF's counter at 25
    assert body["manager_name"] == "Morgan Lee"
    assert body["milestones"] == [] and body["progress"]["total"] == 0
    assert body["team_names"] == []  # no team yet: the manager assigns one

    rows = _audit_rows(conn, body["id"], "created")
    assert len(rows) == 1 and rows[0]["summary"] == "Created project Network segmentation"
    assert rows[0]["details"]["after"]["budget"] == 42000

    # The new project is now in the manager's list.
    codes = [p["code"] for p in client.get("/projects", headers=_auth(client, SEED_MANAGER)).json()]
    assert "INF-025" in codes


@pytest.mark.parametrize("creds", [SEED_MANAGER, SEED_EMPLOYEE])
def test_only_admin_creates(client, ids, creds):
    assert client.post("/projects", json=_new_project(ids), headers=_auth(client, creds)).status_code == 403


def test_create_rejects_end_before_start(client, ids):
    payload = _new_project(ids, end_date=(date.today() - timedelta(days=1)).isoformat())
    response = client.post("/projects", json=payload, headers=_auth(client, SEED_ADMIN))
    assert response.status_code == 400
    assert "end_date" in response.json()["error"]["fields"]


def test_create_rejects_non_manager_as_manager(client, ids):
    payload = _new_project(ids, manager_id=ids["emp001"])
    response = client.post("/projects", json=payload, headers=_auth(client, SEED_ADMIN))
    assert response.status_code == 400
    assert "manager_id" in response.json()["error"]["fields"]


def test_create_rejects_missing_fields_and_negative_budget(client, ids):
    response = client.post("/projects", json={"name": "x"}, headers=_auth(client, SEED_ADMIN))
    assert response.status_code == 400
    assert "manager_id" in response.json()["error"]["fields"]
    response = client.post("/projects", json=_new_project(ids, budget=-1), headers=_auth(client, SEED_ADMIN))
    assert response.status_code == 400


# --- Update -----------------------------------------------------------------------------------


def test_manager_updates_dates_and_budget_of_own_project(client, conn, ids):
    new_end = (date.today() + timedelta(days=200)).isoformat()
    response = client.patch(
        f"/projects/{ids['inf']}", json={"end_date": new_end, "budget": 125000}, headers=_auth(client, SEED_MANAGER)
    )
    assert response.status_code == 200, response.text
    assert response.json()["end_date"] == new_end and response.json()["budget"] == 125000
    rows = _audit_rows(conn, ids["inf"], "updated")
    assert rows[-1]["details"]["after"] == {"end_date": new_end, "budget": 125000}
    assert rows[-1]["details"]["before"]["budget"] == 120000


def test_manager_cannot_update_another_managers_project(client, ids):
    response = client.patch(f"/projects/{ids['ops']}", json={"budget": 1}, headers=_auth(client, SEED_MANAGER))
    assert response.status_code == 403


def test_manager_cannot_reassign_manager(client, ids):
    response = client.patch(
        f"/projects/{ids['inf']}", json={"manager_id": ids["mgr002"]}, headers=_auth(client, SEED_MANAGER)
    )
    assert response.status_code == 403
    assert "manager_id" in response.json()["error"]["fields"]


def test_employee_cannot_update(client, ids):
    assert client.patch(f"/projects/{ids['inf']}", json={"name": "x"}, headers=_auth(client, SEED_EMPLOYEE)).status_code == 403


def test_admin_reassigns_manager(client, conn, ids):
    response = client.patch(
        f"/projects/{ids['ops']}", json={"manager_id": ids["mgr001"]}, headers=_auth(client, SEED_ADMIN)
    )
    assert response.status_code == 200, response.text
    assert response.json()["manager_name"] == "Morgan Lee"
    # Now mgr001 sees it and mgr002 does not.
    assert "OPS-018" in [p["code"] for p in client.get("/projects", headers=_auth(client, SEED_MANAGER)).json()]
    assert client.get("/projects", headers=_auth(client, MANAGER_2)).json() == []
    # Put it back for the other tests.
    client.patch(f"/projects/{ids['ops']}", json={"manager_id": ids["mgr002"]}, headers=_auth(client, SEED_ADMIN))


def test_update_rejects_dates_out_of_order_and_blank_name(client, ids):
    headers = _auth(client, SEED_ADMIN)
    bad = client.patch(f"/projects/{ids['inf']}", json={"start_date": "2030-01-01"}, headers=headers)
    assert bad.status_code == 400 and "end_date" in bad.json()["error"]["fields"]
    bad = client.patch(f"/projects/{ids['inf']}", json={"name": "   "}, headers=headers)
    assert bad.status_code == 400 and "name" in bad.json()["error"]["fields"]


def test_update_with_no_change_writes_no_audit(client, conn, ids):
    headers = _auth(client, SEED_ADMIN)
    current = client.get(f"/projects/{ids['inf']}", headers=headers).json()["budget"]
    before = len(_audit_rows(conn, ids["inf"]))
    response = client.patch(f"/projects/{ids['inf']}", json={"budget": current}, headers=headers)
    assert response.status_code == 200
    assert len(_audit_rows(conn, ids["inf"])) == before


# --- Archive and restore ----------------------------------------------------------------------


def test_admin_archives_and_restores_project(client, conn, ids):
    admin = _auth(client, SEED_ADMIN)
    response = client.post("/projects", json=_new_project(ids, name="Temporary"), headers=admin)
    project_id = response.json()["id"]

    archived = client.post(f"/projects/{project_id}/archive", headers=admin)
    assert archived.status_code == 200 and archived.json()["is_archived"] is True
    assert client.post(f"/projects/{project_id}/archive", headers=admin).status_code == 409

    # Gone from active lists, present in the archived list, hidden from the manager.
    assert project_id not in [p["id"] for p in client.get("/projects", headers=admin).json()]
    assert project_id in [p["id"] for p in client.get("/projects?archived=true", headers=admin).json()]
    assert client.get(f"/projects/{project_id}", headers=_auth(client, SEED_MANAGER)).status_code == 404
    assert client.patch(f"/projects/{project_id}", json={"budget": 5}, headers=_auth(client, SEED_MANAGER)).status_code == 404

    restored = client.post(f"/projects/{project_id}/restore", headers=admin)
    assert restored.status_code == 200 and restored.json()["is_archived"] is False
    assert [r["action"] for r in _audit_rows(conn, project_id)] == ["created", "archived", "restored"]


@pytest.mark.parametrize("creds", [SEED_MANAGER, SEED_EMPLOYEE])
def test_only_admin_archives(client, ids, creds):
    assert client.post(f"/projects/{ids['inf']}/archive", headers=_auth(client, creds)).status_code == 403
    assert client.get("/projects?archived=true", headers=_auth(client, creds)).status_code == 403


def test_archive_unknown_project_is_not_found(client):
    assert client.post("/projects/999999/archive", headers=_auth(client, SEED_ADMIN)).status_code == 404
