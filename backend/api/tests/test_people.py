"""People and teams: admin user management, manager teams and direct reports, employee My teams."""

import pytest

from tests.conftest import SEED_ADMIN, SEED_EMPLOYEE, SEED_MANAGER, login

MANAGER_2 = {"username": "mgr002", "password": "Manager123!"}
EMPLOYEE_4 = {"username": "emp004", "password": "Employee123!"}


def _auth(client, creds):
    return {"Authorization": f"Bearer {login(client, **creds)}"}


def _user_id(conn, username):
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE username = %s", (username,))
        return cur.fetchone()["id"]


def _project_id(conn, code):
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM projects WHERE code = %s", (code,))
        return cur.fetchone()["id"]


def _team_id(conn, name):
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM teams WHERE name = %s ORDER BY id LIMIT 1", (name,))
        return cur.fetchone()["id"]


def _audit(conn, entity_type, entity_id):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT action, summary, details FROM audit_log WHERE entity_type = %s AND entity_id = %s ORDER BY id",
            (entity_type, entity_id),
        )
        return cur.fetchall()


def _new_person(ids, **overrides):
    return {
        "first_name": "Riley",
        "last_name": "Park",
        "email": "Riley.Park@acme.test",
        "job_title": "Storage Engineer",
        "role": "employee",
        "department_id": ids["dept_inf"],
        "manager_id": ids["mgr001"],
        "hourly_rate": 55,
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
        "mgr002": _user_id(conn, "mgr002"),
        "emp001": _user_id(conn, "emp001"),
        "emp003": _user_id(conn, "emp003"),
        "emp004": _user_id(conn, "emp004"),
        "inf": _project_id(conn, "INF-024"),
        "ops": _project_id(conn, "OPS-018"),
        "server_ops": _team_id(conn, "Server Ops"),
        "asset_control": _team_id(conn, "Asset Control"),
        "dept_inf": dept,
    }


# --- Admin: list and profile ------------------------------------------------------------------


def test_people_list_is_paginated_and_admin_only(client):
    admin = _auth(client, SEED_ADMIN)
    page = client.get("/users?limit=3", headers=admin).json()
    assert page["page"] == 1 and page["limit"] == 3 and page["total"] >= 7
    assert len(page["items"]) == 3
    assert page["counts"]["admin"] >= 1 and page["counts"]["manager"] >= 2 and page["counts"]["employee"] >= 4
    first = page["items"][0]
    assert first["code"].startswith("USR-") and "password_hash" not in first
    assert "hours_this_week" in first and "team_names" in first

    second = client.get("/users?limit=3&page=2", headers=admin).json()
    assert [u["id"] for u in second["items"]] != [u["id"] for u in page["items"]]
    assert client.get("/users?limit=3&page=99", headers=admin).json()["items"] == []
    assert client.get("/users", headers=_auth(client, SEED_MANAGER)).status_code == 403
    assert client.get("/users").status_code == 401


def test_people_search_and_filters(client, ids):
    admin = _auth(client, SEED_ADMIN)
    names = [u["name"] for u in client.get("/users?q=rivera", headers=admin).json()["items"]]
    assert names == ["Sam Rivera"]
    assert [u["username"] for u in client.get("/users?q=emp004", headers=admin).json()["items"]] == ["emp004"]
    roles = {u["role"] for u in client.get("/users?role=manager", headers=admin).json()["items"]}
    assert roles == {"manager"}
    depts = {u["department"] for u in client.get(f"/users?department_id={ids['dept_inf']}", headers=admin).json()["items"]}
    assert depts == {"Infrastructure"}
    assert client.get("/users?role=boss", headers=admin).status_code == 400
    assert client.get("/users?limit=500", headers=admin).status_code == 400


def test_people_row_carries_hours_and_capacity(client):
    admin = _auth(client, SEED_ADMIN)
    sam = client.get("/users?q=sam.rivera", headers=admin).json()["items"][0]
    assert sam["team_names"] == ["Server Ops"] and sam["manager_name"] == "Morgan Lee"
    assert sam["cost_this_week"] == pytest.approx(sam["hours_this_week"] * 60)
    assert sam["over_capacity"] is False
    assert sam["tasks"]["total"] == 3 and sam["tasks"]["completed"] == 1


def test_admin_profile_lists_projects_teams_and_blockers(client, ids):
    admin = _auth(client, SEED_ADMIN)
    body = client.get(f"/users/{ids['emp001']}", headers=admin).json()
    assert [p["code"] for p in body["projects"]] == ["INF-024"]
    assert body["projects"][0]["relation"] == "member" and body["projects"][0]["actual_hours"] > 0
    assert [t["name"] for t in body["teams"]] == ["Server Ops"]
    assert [m["name"] for m in body["milestones"]] == ["Inventory and dependency mapping", "Workload migration"]
    assert len(body["recent_entries"]) > 0 and body["recent_entries"][0]["task_code"].startswith("TSK-")
    assert body["lifetime_cost"] == pytest.approx(body["lifetime_hours"] * 60)
    assert body["blockers"] == ["Has 2 tasks not completed yet"] and body["can_archive"] is False

    manager = client.get(f"/users/{ids['mgr001']}", headers=admin).json()
    assert manager["projects"][0]["relation"] == "manages" and manager["direct_reports"] == 3
    assert len(manager["blockers"]) == 2

    me = client.get(f"/users/{ids['adm001']}", headers=admin).json()
    assert "You cannot archive your own account" in me["blockers"]
    assert client.get("/users/999999", headers=admin).status_code == 404


def test_user_form_options(client):
    body = client.get("/users/options", headers=_auth(client, SEED_ADMIN)).json()
    assert {m["name"] for m in body["managers"]} >= {"Morgan Lee", "Taylor Brooks"}
    assert {d["prefix"] for d in body["departments"]} == {"INF", "OPS"}
    assert client.get("/users/options", headers=_auth(client, SEED_EMPLOYEE)).status_code == 403


# --- Admin: create ----------------------------------------------------------------------------


def test_admin_creates_user_with_generated_username(client, conn, ids):
    admin = _auth(client, SEED_ADMIN)
    response = client.post("/users", json=_new_person(ids), headers=admin)
    assert response.status_code == 201, response.text
    body = response.json()
    assert len(body["username"]) == 6 and body["username"].isalnum() and body["username"].islower()
    assert body["email"] == "riley.park@acme.test"  # stored lower-cased
    assert body["code"] == f"USR-{body['id']:03d}" and body["manager_name"] == "Morgan Lee"
    assert body["teams"] == [] and body["projects"] == [] and body["can_archive"] is True

    rows = _audit(conn, "user", body["id"])
    assert [r["action"] for r in rows] == ["created"]
    assert rows[0]["summary"] == "Created employee account for Riley Park"
    assert "password" not in rows[0]["details"]["after"]

    # The new person can sign in with the temporary password and is in the manager's team list.
    token = login(client, body["username"], "Welcome123!")
    assert client.get("/me", headers={"Authorization": f"Bearer {token}"}).json()["id"] == body["id"]
    reports = client.get("/employees", headers=_auth(client, SEED_MANAGER)).json()
    assert "Riley Park" in [r["name"] for r in reports]


@pytest.mark.parametrize("creds", [SEED_MANAGER, SEED_EMPLOYEE])
def test_only_admin_creates_users(client, ids, creds):
    assert client.post("/users", json=_new_person(ids), headers=_auth(client, creds)).status_code == 403


def test_create_user_validation(client, ids):
    admin = _auth(client, SEED_ADMIN)

    def field_of(**overrides):
        payload = _new_person(ids, **{"email": "validate.me@acme.test", **overrides})
        response = client.post("/users", json=payload, headers=admin)
        assert response.status_code == 400, response.text
        return response.json()["error"]["fields"]

    assert "email" in field_of(email="sam.rivera@acme.test")  # taken
    assert "email" in field_of(email="not-an-email")
    assert "manager_id" in field_of(manager_id=ids["emp001"])  # not a manager
    assert "manager_id" in field_of(role="manager")  # managers report to nobody
    assert "password" in field_of(password="short")
    assert "role" in field_of(role="boss")
    assert "hourly_rate" in field_of(hourly_rate=-1)
    assert "department_id" in field_of(department_id=999999)
    assert "first_name" in field_of(first_name="   ")
    assert client.post("/users", json={}, headers=admin).status_code == 400


def test_admin_creates_manager_without_manager(client, ids):
    payload = _new_person(ids, email="new.manager@acme.test", role="manager", manager_id=None)
    body = client.post("/users", json=payload, headers=_auth(client, SEED_ADMIN)).json()
    assert body["role"] == "manager" and body["manager_id"] is None


def test_admin_creates_employee_without_manager(client, ids):
    """A new employee starts unassigned; a manager takes them on from the employee list."""
    payload = _new_person(ids, email="unassigned.employee@acme.test", manager_id=None)
    body = client.post("/users", json=payload, headers=_auth(client, SEED_ADMIN)).json()
    assert body["role"] == "employee" and body["manager_id"] is None and body["manager_name"] is None


# --- Admin: update, role change, archive ------------------------------------------------------


def test_admin_updates_fields_and_audits_changes(client, conn, ids):
    admin = _auth(client, SEED_ADMIN)
    created = client.post("/users", json=_new_person(ids, email="edit.me@acme.test"), headers=admin).json()
    response = client.patch(f"/users/{created['id']}", json={"job_title": "Senior Storage Engineer", "hourly_rate": 70}, headers=admin)
    assert response.status_code == 200, response.text
    assert response.json()["job_title"] == "Senior Storage Engineer" and response.json()["hourly_rate"] == 70
    rows = _audit(conn, "user", created["id"])
    assert rows[-1]["action"] == "updated" and rows[-1]["details"]["after"] == {"job_title": "Senior Storage Engineer", "hourly_rate": 70}
    assert rows[-1]["details"]["before"]["hourly_rate"] == 55

    # No change, no audit row.
    before = len(_audit(conn, "user", created["id"]))
    client.patch(f"/users/{created['id']}", json={"hourly_rate": 70}, headers=admin)
    assert len(_audit(conn, "user", created["id"])) == before

    bad = client.patch(f"/users/{created['id']}", json={"email": "sam.rivera@acme.test"}, headers=admin)
    assert bad.status_code == 400 and "email" in bad.json()["error"]["fields"]


def test_role_change_rules(client, ids):
    admin = _auth(client, SEED_ADMIN)
    # An employee with open tasks cannot become a manager.
    blocked = client.patch(f"/users/{ids['emp001']}", json={"role": "manager"}, headers=admin)
    assert blocked.status_code == 409 and "not completed" in blocked.json()["error"]["message"]
    # A manager with projects cannot become an employee.
    blocked = client.patch(f"/users/{ids['mgr001']}", json={"role": "employee", "manager_id": ids["mgr002"]}, headers=admin)
    assert blocked.status_code == 409 and "active project" in blocked.json()["error"]["message"]

    # A fresh employee can become a manager; the manager link is cleared.
    created = client.post("/users", json=_new_person(ids, email="promote.me@acme.test"), headers=admin).json()
    promoted = client.patch(f"/users/{created['id']}", json={"role": "manager"}, headers=admin).json()
    assert promoted["role"] == "manager" and promoted["manager_id"] is None
    # Back to employee: unassigned unless the admin picks a manager.
    unassigned = client.patch(f"/users/{created['id']}", json={"role": "employee"}, headers=admin).json()
    assert unassigned["role"] == "employee" and unassigned["manager_id"] is None
    client.patch(f"/users/{created['id']}", json={"role": "manager"}, headers=admin)
    demoted = client.patch(f"/users/{created['id']}", json={"role": "employee", "manager_id": ids["mgr002"]}, headers=admin).json()
    assert demoted["role"] == "employee" and demoted["manager_name"] == "Taylor Brooks"


def test_archive_rules_and_restore(client, conn, ids):
    admin = _auth(client, SEED_ADMIN)
    blocked = client.post(f"/users/{ids['emp001']}/archive", headers=admin)
    assert blocked.status_code == 409 and "not completed" in blocked.json()["error"]["message"]
    assert client.post(f"/users/{ids['mgr001']}/archive", headers=admin).status_code == 409
    me = client.post(f"/users/{ids['adm001']}/archive", headers=admin)
    assert me.status_code == 409 and "own account" in me.json()["error"]["message"]

    created = client.post("/users", json=_new_person(ids, email="archive.me@acme.test"), headers=admin).json()
    password = "Welcome123!"
    archived = client.post(f"/users/{created['id']}/archive", headers=admin)
    assert archived.status_code == 200 and archived.json()["is_archived"] is True
    assert client.post(f"/users/{created['id']}/archive", headers=admin).status_code == 409
    # Login is revoked, the person leaves the active list and appears in the archived one.
    assert client.post("/auth/login", json={"username": created["username"], "password": password}).status_code == 401
    assert created["id"] not in [u["id"] for u in client.get("/users?q=archive.me", headers=admin).json()["items"]]
    assert created["id"] in [u["id"] for u in client.get("/users?archived=true", headers=admin).json()["items"]]
    assert created["id"] not in [u["id"] for u in client.get("/employees", headers=_auth(client, SEED_MANAGER)).json()]

    restored = client.post(f"/users/{created['id']}/restore", headers=admin)
    assert restored.status_code == 200 and restored.json()["is_archived"] is False
    assert [r["action"] for r in _audit(conn, "user", created["id"])] == ["created", "archived", "restored"]
    assert client.post("/users/999999/archive", headers=admin).status_code == 404


def test_last_admin_cannot_be_archived(client, ids):
    admin = _auth(client, SEED_ADMIN)
    second = client.post("/users", json=_new_person(ids, email="second.admin@acme.test", role="admin", manager_id=None), headers=admin).json()
    other = {"Authorization": f"Bearer {login(client, second['username'], 'Welcome123!')}"}
    # With two admins, the second one can archive the first... but not when it would leave none.
    assert client.post(f"/users/{second['id']}/archive", headers=admin).status_code == 200
    blocked = client.post(f"/users/{ids['adm001']}/archive", headers=other)
    assert blocked.status_code == 401  # the second admin is archived now, so their token is dead
    blocked = client.post(f"/users/{ids['adm001']}/archive", headers=admin)
    assert blocked.status_code == 409 and "own account" in blocked.json()["error"]["message"]
    # Restore the second admin and check the "last administrator" rule from their side.
    client.post(f"/users/{second['id']}/restore", headers=admin)
    other = {"Authorization": f"Bearer {login(client, second['username'], 'Welcome123!')}"}
    assert client.post(f"/users/{ids['adm001']}/archive", headers=other).status_code == 200
    try:
        blocked = client.post(f"/users/{second['id']}/archive", headers=other)
        assert blocked.status_code == 409 and "own account" in blocked.json()["error"]["message"]
        blockers = client.get(f"/users/{second['id']}", headers=other).json()["blockers"]
        assert any("last active administrator" in b for b in blockers)
    finally:
        assert client.post(f"/users/{ids['adm001']}/restore", headers=other).status_code == 200


# --- Manager: direct reports ------------------------------------------------------------------


def test_manager_lists_direct_reports_with_figures(client):
    rows = client.get("/employees", headers=_auth(client, SEED_MANAGER)).json()
    assert {r["name"] for r in rows} >= {"Sam Rivera", "Priya Natarajan", "Jordan Okafor"}
    assert "Casey Nguyen" not in {r["name"] for r in rows}
    sam = next(r for r in rows if r["name"] == "Sam Rivera")
    assert sam["hours_this_week"] > 0 and sam["tasks"]["percent"] == 33 and sam["team_names"] == ["Server Ops"]
    assert client.get("/employees", headers=_auth(client, SEED_EMPLOYEE)).status_code == 403
    assert client.get("/employees", headers=_auth(client, SEED_ADMIN)).status_code == 403


def test_manager_reads_and_edits_only_direct_reports(client, conn, ids):
    manager = _auth(client, SEED_MANAGER)
    body = client.get(f"/employees/{ids['emp001']}", headers=manager).json()
    assert body["projects"][0]["code"] == "INF-024" and body["recent_entries"]
    assert body["blockers"] == [] and body["can_archive"] is False  # managers never archive
    assert client.get(f"/employees/{ids['emp004']}", headers=manager).status_code == 404

    renamed = client.patch(f"/employees/{ids['emp003']}", json={"first_name": "Jordan", "last_name": "Okafor-Ade"}, headers=manager)
    assert renamed.status_code == 200 and renamed.json()["name"] == "Jordan Okafor-Ade"
    assert _audit(conn, "user", ids["emp003"])[-1]["details"]["after"] == {"last_name": "Okafor-Ade"}
    client.patch(f"/employees/{ids['emp003']}", json={"last_name": "Okafor"}, headers=manager)

    forbidden = client.patch(f"/employees/{ids['emp003']}", json={"hourly_rate": 99}, headers=manager)
    assert forbidden.status_code == 403 and "hourly_rate" in forbidden.json()["error"]["fields"]
    assert client.patch(f"/employees/{ids['emp004']}", json={"first_name": "x"}, headers=manager).status_code == 404
    assert client.patch(f"/employees/{ids['emp001']}", json={"first_name": "x"}, headers=_auth(client, SEED_EMPLOYEE)).status_code == 403


# --- Manager: teams ---------------------------------------------------------------------------


def test_manager_lists_own_teams(client, ids):
    teams = client.get("/teams", headers=_auth(client, SEED_MANAGER)).json()
    assert [t["name"] for t in teams] == ["Server Ops"]
    team = teams[0]
    assert team["code"] == f"TEAM-{team['id']:02d}"
    assert {m["name"] for m in team["members"]} == {"Sam Rivera", "Priya Natarajan", "Jordan Okafor"}
    assert [p["code"] for p in team["projects"]] == ["INF-024"]
    assert team["hours_this_week"] == pytest.approx(sum(m["hours_this_week"] for m in team["members"]))
    assert [t["name"] for t in client.get("/teams", headers=_auth(client, MANAGER_2)).json()] == ["Asset Control"]
    assert client.get(f"/teams/{ids['asset_control']}", headers=_auth(client, SEED_MANAGER)).status_code == 404
    assert client.get("/teams", headers=_auth(client, SEED_EMPLOYEE)).status_code == 403


def test_team_options_and_people_search(client, ids):
    """The picker is GET /employees/search: my own and unassigned employees, never another manager's."""
    manager = _auth(client, SEED_MANAGER)
    options = client.get("/teams/options", headers=manager).json()
    assert "Storage Engineer" in options["job_titles"] and "Systems Engineer" in options["job_titles"]
    assert [p["code"] for p in options["projects"]] == ["INF-024"]

    body = client.get("/employees/search", headers=manager).json()
    assert body["limit"] == 25 and body["total"] == len(body["items"])
    people = {p["name"]: p for p in body["items"]}
    assert set(people) >= {"Sam Rivera", "Priya Natarajan", "Jordan Okafor", "Alex Kim"}
    assert "Casey Nguyen" not in people  # reports to the other manager
    assert "Morgan Lee" not in people  # managers and admins are never team members
    assert people["Sam Rivera"]["manager_id"] == ids["mgr001"]
    assert people["Alex Kim"]["manager_id"] is None
    assert [p["name"] for p in client.get("/employees/search?q=alex", headers=manager).json()["items"]] == ["Alex Kim"]
    # Exact job title filter, still within the manager's own and unassigned people (earlier tests
    # in this module add Storage Engineers under this manager, so more than Alex may match).
    storage = client.get("/employees/search?job_title=Storage%20Engineer", headers=manager).json()["items"]
    assert "Alex Kim" in [p["name"] for p in storage]
    assert all(p["job_title"] == "Storage Engineer" and p["manager_id"] in (None, ids["mgr001"]) for p in storage)
    # Casey Nguyen is the only Inventory Analyst and reports to the other manager: never offered, nor their title.
    assert client.get("/employees/search?job_title=Inventory%20Analyst", headers=manager).json() == {"items": [], "total": 0, "limit": 25}
    assert "Inventory Analyst" not in options["job_titles"]
    on_team = {p["name"] for p in client.get(f"/employees/search?exclude_team_id={ids['server_ops']}", headers=manager).json()["items"]}
    assert "Sam Rivera" not in on_team and "Alex Kim" in on_team
    assert client.get("/employees/search", headers=_auth(client, SEED_EMPLOYEE)).status_code == 403


def test_manager_takes_on_and_releases_an_unassigned_employee(client, conn, ids):
    manager = _auth(client, SEED_MANAGER)
    other = _auth(client, MANAGER_2)
    alex = _user_id(conn, "emp005")
    assert client.get(f"/employees/{alex}", headers=manager).status_code == 404

    taken = client.post(f"/employees/{alex}/assign", headers=manager)
    assert taken.status_code == 200, taken.text
    assert taken.json()["manager_id"] == ids["mgr001"] and taken.json()["manager_name"] == "Morgan Lee"
    assert "Alex Kim" in {r["name"] for r in client.get("/employees", headers=manager).json()}
    assert client.post(f"/employees/{alex}/assign", headers=manager).status_code == 409  # already mine
    blocked = client.post(f"/employees/{alex}/assign", headers=other)  # someone else's now
    assert blocked.status_code == 400 and "Morgan Lee" in blocked.json()["error"]["fields"]["user_id"]
    assert client.post(f"/employees/{alex}/release", headers=other).status_code == 404

    # On a team, then released: off the team and back in the pool.
    team_id = client.post("/teams", json={"name": "Pool test", "member_ids": [alex]}, headers=manager).json()["id"]
    assert client.post(f"/employees/{alex}/release", headers=manager).status_code == 204
    assert client.get(f"/teams/{team_id}", headers=manager).json()["members"] == []
    assert "Alex Kim" not in {r["name"] for r in client.get("/employees", headers=manager).json()}
    assert next(p for p in client.get("/employees/search?q=alex", headers=other).json()["items"] if p["id"] == alex)["manager_id"] is None
    assert [r["action"] for r in _audit(conn, "user", alex)] == ["assigned", "unassigned"]
    assert _audit(conn, "user", alex)[-1]["summary"] == "Released Alex Kim from direct reports and 1 team"

    # Release is refused while the person still has open tasks; other roles cannot call either route.
    busy = client.post(f"/employees/{ids['emp001']}/release", headers=manager)
    assert busy.status_code == 409 and "not completed" in busy.json()["error"]["message"]
    assert client.post(f"/employees/{alex}/assign", headers=_auth(client, SEED_ADMIN)).status_code == 403
    assert client.post(f"/employees/{alex}/assign", headers=_auth(client, SEED_EMPLOYEE)).status_code == 403
    assert client.post(f"/employees/{ids['mgr002']}/assign", headers=manager).status_code == 404


def test_adding_an_unassigned_employee_to_a_team_takes_them_on(client, conn, ids):
    manager = _auth(client, SEED_MANAGER)
    alex = _user_id(conn, "emp005")
    team_id = client.post("/teams", json={"name": "Claim test"}, headers=manager).json()["id"]
    added = client.post(f"/teams/{team_id}/members/{alex}", headers=manager)
    assert added.status_code == 200 and [m["id"] for m in added.json()["members"]] == [alex]
    assert client.get(f"/employees/{alex}", headers=manager).json()["manager_id"] == ids["mgr001"]
    assert _audit(conn, "user", alex)[-1]["summary"] == "Added Alex Kim as a direct report"
    assert client.post(f"/employees/{alex}/release", headers=manager).status_code == 204


def test_create_team_with_members_and_project(client, conn, ids):
    manager = _auth(client, SEED_MANAGER)
    response = client.post("/teams", json={"name": "Network crew", "member_ids": [ids["emp001"], ids["emp003"]], "project_id": ids["inf"]}, headers=manager)
    assert response.status_code == 201, response.text
    team = response.json()
    assert {m["id"] for m in team["members"]} == {ids["emp001"], ids["emp003"]}
    assert [p["id"] for p in team["projects"]] == [ids["inf"]]
    rows = _audit(conn, "team", team["id"])
    assert rows[0]["action"] == "created" and rows[0]["summary"] == "Created team Network crew with 2 members on INF-024"

    assert "Network crew" in client.get(f"/projects/{ids['inf']}", headers=manager).json()["team_names"]
    assert client.post("/teams", json={"name": "x", "member_ids": [ids["emp004"]]}, headers=manager).status_code == 400
    assert client.post("/teams", json={"name": "x", "project_id": ids["ops"]}, headers=manager).status_code == 403
    assert client.post("/teams", json={"name": "   "}, headers=manager).status_code == 400
    assert client.post("/teams", json={"name": "x"}, headers=_auth(client, SEED_ADMIN)).status_code == 403


def test_rename_team(client, conn, ids):
    manager = _auth(client, SEED_MANAGER)
    team_id = client.post("/teams", json={"name": "Temp name"}, headers=manager).json()["id"]
    renamed = client.patch(f"/teams/{team_id}", json={"name": "Final name"}, headers=manager)
    assert renamed.status_code == 200 and renamed.json()["name"] == "Final name"
    assert _audit(conn, "team", team_id)[-1]["summary"] == "Renamed team Temp name to Final name"
    assert client.patch(f"/teams/{team_id}", json={"name": "x"}, headers=_auth(client, MANAGER_2)).status_code == 403
    assert client.patch("/teams/999999", json={"name": "x"}, headers=manager).status_code == 404


def test_add_and_remove_members(client, conn, ids):
    manager = _auth(client, SEED_MANAGER)
    team_id = client.post("/teams", json={"name": "Members test"}, headers=manager).json()["id"]
    added = client.post(f"/teams/{team_id}/members/{ids['emp001']}", headers=manager)
    assert added.status_code == 200 and [m["id"] for m in added.json()["members"]] == [ids["emp001"]]
    assert client.post(f"/teams/{team_id}/members/{ids['emp001']}", headers=manager).status_code == 409
    not_mine = client.post(f"/teams/{team_id}/members/{ids['emp004']}", headers=manager)
    assert not_mine.status_code == 400 and "user_id" in not_mine.json()["error"]["fields"]
    assert client.post(f"/teams/{team_id}/members/{ids['mgr002']}", headers=manager).status_code == 400
    assert client.post(f"/teams/{team_id}/members/{ids['emp001']}", headers=_auth(client, MANAGER_2)).status_code == 403

    assert client.delete(f"/teams/{team_id}/members/{ids['emp001']}", headers=manager).status_code == 204
    assert client.get(f"/teams/{team_id}", headers=manager).json()["members"] == []
    assert client.delete(f"/teams/{team_id}/members/{ids['emp001']}", headers=manager).status_code == 404
    assert [r["action"] for r in _audit(conn, "team", team_id)] == ["created", "assigned", "updated"]


def test_attach_and_detach_team(client, conn, ids):
    manager = _auth(client, SEED_MANAGER)
    team_id = client.post("/teams", json={"name": "Attach test", "member_ids": [ids["emp003"]]}, headers=manager).json()["id"]
    attached = client.post(f"/projects/{ids['inf']}/teams/{team_id}", headers=manager)
    assert attached.status_code == 200 and [p["code"] for p in attached.json()["projects"]] == ["INF-024"]
    assert client.post(f"/projects/{ids['inf']}/teams/{team_id}", headers=manager).status_code == 409
    assert client.post(f"/projects/{ids['ops']}/teams/{team_id}", headers=manager).status_code == 403
    assert client.post(f"/projects/{ids['inf']}/teams/{ids['asset_control']}", headers=manager).status_code == 403
    assert client.post(f"/projects/999999/teams/{team_id}", headers=manager).status_code == 404
    rows = _audit(conn, "project", ids["inf"])
    assert rows[-1]["action"] == "assigned" and rows[-1]["summary"] == "Assigned team Attach test to Legacy server retirement"

    assert client.delete(f"/projects/{ids['inf']}/teams/{team_id}", headers=manager).status_code == 204
    assert client.delete(f"/projects/{ids['inf']}/teams/{team_id}", headers=manager).status_code == 404
    assert client.get(f"/teams/{team_id}", headers=manager).json()["projects"] == []


def test_new_project_gets_tasks_once_a_team_is_attached(client, ids):
    """The slice 3 loose end: a project without a team cannot have tasks; attaching one fixes that."""
    admin = _auth(client, SEED_ADMIN)
    manager = _auth(client, SEED_MANAGER)
    project = client.post(
        "/projects",
        json={"name": "Team attach flow", "department_id": ids["dept_inf"], "manager_id": ids["mgr001"], "start_date": "2026-11-01", "end_date": "2026-12-31", "budget": 1000},
        headers=admin,
    ).json()
    milestone = client.post(f"/projects/{project['id']}/milestones", json={"name": "Only step"}, headers=manager).json()
    assert milestone["assignable"] == []
    refused = client.post(f"/milestones/{milestone['id']}/tasks", json={"title": "x", "assigned_to": ids["emp001"]}, headers=manager)
    assert refused.status_code == 400

    assert client.post(f"/projects/{project['id']}/teams/{ids['server_ops']}", headers=manager).status_code == 200
    assert client.get(f"/projects/{project['id']}", headers=admin).json()["team_names"] == ["Server Ops"]
    created = client.post(f"/milestones/{milestone['id']}/tasks", json={"title": "Now possible", "assigned_to": ids["emp001"]}, headers=manager)
    assert created.status_code == 201
    client.delete(f"/projects/{project['id']}/teams/{ids['server_ops']}", headers=manager)
    client.post(f"/projects/{project['id']}/archive", headers=admin)


# --- Employee: My teams -----------------------------------------------------------------------


def test_employee_sees_own_teams_with_progress_but_no_cost(client, ids):
    body = client.get("/me/teams", headers=_auth(client, SEED_EMPLOYEE)).json()
    assert body["manager"]["name"] == "Morgan Lee" and body["manager"]["email"] == "morgan.lee@acme.test"
    assert body["active_milestone_id"] is not None
    names = [t["name"] for t in body["teams"]]
    assert "Server Ops" in names
    team = next(t for t in body["teams"] if t["name"] == "Server Ops")
    assert team["manager_name"] == "Morgan Lee"
    me = next(m for m in team["members"] if m["is_me"])
    assert me["name"] == "Sam Rivera" and me["progress"]["total"] == 3
    assert all("cost" not in m and "hourly_rate" not in m for m in team["members"])
    project = next(p for p in team["projects"] if p["code"] == "INF-024")
    assert project["milestone"]["name"] == "Workload migration" and project["milestone"]["sequence"] == 2
    assert project["is_active"] is True and project["my_progress"]["total"] == 2
    assert project["my_hours"] > 0 and "budget" not in project


def test_my_teams_is_employee_only_and_marks_secondary_projects(client, ids):
    assert client.get("/me/teams", headers=_auth(client, SEED_MANAGER)).status_code == 403
    assert client.get("/me/teams").status_code == 401
    body = client.get("/me/teams", headers=_auth(client, EMPLOYEE_4)).json()
    assert body["manager"]["name"] == "Taylor Brooks"
    project = body["teams"][0]["projects"][0]
    assert project["code"] == "OPS-018" and project["is_active"] is True
    assert project["milestone"]["name"] == "Physical audit"
