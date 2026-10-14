"""Settings: anyone edits their own name and email (PATCH /me); admins manage departments."""

from datetime import date, timedelta

import pytest

from tests.conftest import SEED_ADMIN, SEED_EMPLOYEE, SEED_MANAGER, login

ROLES = [SEED_ADMIN, SEED_MANAGER, SEED_EMPLOYEE]
SEED_PROFILES = {
    "adm001": {"first_name": "Ada", "last_name": "Admin", "email": "ada.admin@acme.test"},
    "mgr001": {"first_name": "Morgan", "last_name": "Lee", "email": "morgan.lee@acme.test"},
    "emp001": {"first_name": "Sam", "last_name": "Rivera", "email": "sam.rivera@acme.test"},
}


def _auth(client, creds):
    return {"Authorization": f"Bearer {login(client, **creds)}"}


def _user_id(conn, username):
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE username = %s", (username,))
        return cur.fetchone()["id"]


def _audit(conn, entity_type, entity_id):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT action, entity_code, summary, details FROM audit_log WHERE entity_type = %s AND entity_id = %s ORDER BY id",
            (entity_type, entity_id),
        )
        return cur.fetchall()


def _fields(response):
    assert response.status_code == 400, response.text
    body = response.json()
    assert body["success"] is False and body["error"]["code"] == "VALIDATION_ERROR"
    return body["error"]["fields"]


def _department(client, headers, prefix):
    return next(d for d in client.get("/departments", headers=headers).json() if d["prefix"] == prefix)


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    """Put the seeded profiles back and remove the departments and projects this module creates."""
    from app.db import connection as db

    conn = db.get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT max(id) AS n FROM departments")
        departments = cur.fetchone()["n"]
        cur.execute("SELECT max(id) AS n FROM projects")
        projects = cur.fetchone()["n"]
        cur.execute("SELECT max(id) AS n FROM audit_log")
        audit_rows = cur.fetchone()["n"]
    yield
    conn.rollback()
    with conn.cursor() as cur:
        for username, profile in SEED_PROFILES.items():
            cur.execute(
                "UPDATE users SET first_name = %s, last_name = %s, email = %s WHERE username = %s",
                (profile["first_name"], profile["last_name"], profile["email"], username),
            )
        # A department with projects cannot go until the projects and their audit rows are gone.
        cur.execute("DELETE FROM milestones WHERE project_id > %s", (projects,))
        cur.execute("DELETE FROM projects WHERE id > %s", (projects,))
        cur.execute("DELETE FROM audit_log WHERE id > %s", (audit_rows,))
        cur.execute("DELETE FROM departments WHERE id > %s", (departments,))
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


# --- PATCH /me ----------------------------------------------------------------------------------


@pytest.mark.parametrize("creds", ROLES, ids=["admin", "manager", "employee"])
def test_everyone_edits_own_name_and_email(client, conn, creds):
    headers = _auth(client, creds)
    me = client.get("/me", headers=headers).json()
    seed = SEED_PROFILES[creds["username"]]
    assert {k: me[k] for k in seed} == seed
    before = len(_audit(conn, "user", me["id"]))

    response = client.patch(
        "/me",
        json={"first_name": "  Jordan ", "last_name": " Quinn-Test  ", "email": f"  {creds['username'].upper()}.New@Acme.TEST "},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["id"] == me["id"] and body["username"] == creds["username"] and body["role"] == me["role"]
    assert body["first_name"] == "Jordan" and body["last_name"] == "Quinn-Test"  # trimmed
    assert body["email"] == f"{creds['username']}.new@acme.test"  # trimmed and lower-cased
    assert "password_hash" not in body
    assert client.get("/me", headers=headers).json()["first_name"] == "Jordan"

    rows = _audit(conn, "user", me["id"])
    assert len(rows) == before + 1
    row = rows[-1]
    assert row["action"] == "updated" and row["entity_code"] == f"USR-{me['id']:03d}"
    assert row["summary"] == "Updated own profile (first_name, last_name, email)"
    assert row["details"]["before"] == seed
    assert row["details"]["after"] == {"first_name": "Jordan", "last_name": "Quinn-Test", "email": f"{creds['username']}.new@acme.test"}

    # The same token still works and the seed profile goes back.
    restored = client.patch("/me", json=seed, headers=headers)
    assert restored.status_code == 200 and {k: restored.json()[k] for k in seed} == seed
    assert len(_audit(conn, "user", me["id"])) == before + 2


def test_me_update_single_field_only_touches_that_field(client, conn, ids):
    headers = _auth(client, SEED_EMPLOYEE)
    before = len(_audit(conn, "user", ids["emp001"]))
    response = client.patch("/me", json={"last_name": "Rivera-Test"}, headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["first_name"] == "Sam" and response.json()["email"] == "sam.rivera@acme.test"
    row = _audit(conn, "user", ids["emp001"])[-1]
    assert row["summary"] == "Updated own profile (last_name)"
    assert row["details"] == {"before": {"last_name": "Rivera"}, "after": {"last_name": "Rivera-Test"}}
    assert client.patch("/me", json={"last_name": "Rivera"}, headers=headers).status_code == 200
    assert len(_audit(conn, "user", ids["emp001"])) == before + 2


def test_me_update_rejects_email_used_by_another_account(client, conn, ids):
    headers = _auth(client, SEED_EMPLOYEE)
    before = len(_audit(conn, "user", ids["emp001"]))
    for taken in ("morgan.lee@acme.test", "Morgan.Lee@ACME.test", " ada.admin@acme.test "):
        fields = _fields(client.patch("/me", json={"email": taken}, headers=headers))
        assert fields == {"email": "Another account already uses this email"}
    assert client.get("/me", headers=headers).json()["email"] == "sam.rivera@acme.test"
    assert len(_audit(conn, "user", ids["emp001"])) == before

    # Keeping your own email, in any case, is not a conflict.
    assert client.patch("/me", json={"email": "SAM.RIVERA@acme.test"}, headers=headers).status_code == 200
    assert len(_audit(conn, "user", ids["emp001"])) == before


@pytest.mark.parametrize("email", ["not-an-email", "sam@", "@acme.test", "sam rivera@acme.test"])
def test_me_update_rejects_invalid_email(client, email):
    headers = _auth(client, SEED_EMPLOYEE)
    assert _fields(client.patch("/me", json={"email": email}, headers=headers)) == {"email": "Enter a valid email address"}
    assert client.get("/me", headers=headers).json()["email"] == "sam.rivera@acme.test"


@pytest.mark.parametrize("field", ["first_name", "last_name"])
def test_me_update_rejects_blank_names(client, conn, ids, field):
    headers = _auth(client, SEED_MANAGER)
    before = len(_audit(conn, "user", ids["mgr001"]))
    assert _fields(client.patch("/me", json={field: "   "}, headers=headers)) == {field: "Name is required"}
    assert field in _fields(client.patch("/me", json={field: ""}, headers=headers))
    assert field in _fields(client.patch("/me", json={field: None}, headers=headers))
    me = client.get("/me", headers=headers).json()
    assert me["first_name"] == "Morgan" and me["last_name"] == "Lee"
    assert len(_audit(conn, "user", ids["mgr001"])) == before


def test_me_update_without_change_writes_no_audit_row(client, conn, ids):
    headers = _auth(client, SEED_ADMIN)
    before = len(_audit(conn, "user", ids["adm001"]))
    same = {"first_name": "Ada", "last_name": " Admin ", "email": "ADA.ADMIN@acme.test"}
    response = client.patch("/me", json=same, headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["last_name"] == "Admin" and response.json()["email"] == "ada.admin@acme.test"
    assert client.patch("/me", json={}, headers=headers).status_code == 200
    assert len(_audit(conn, "user", ids["adm001"])) == before


def test_me_update_ignores_fields_that_are_not_self_service(client, ids):
    headers = _auth(client, SEED_EMPLOYEE)
    response = client.patch("/me", json={"role": "admin", "job_title": "CTO", "hourly_rate": 999, "username": "root"}, headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["role"] == "employee" and body["job_title"] == "Systems Engineer" and body["username"] == "emp001"


def test_me_update_needs_a_token(client):
    assert client.patch("/me", json={"first_name": "Nobody"}).status_code == 401
    assert client.patch("/me", json={"first_name": "Nobody"}, headers={"Authorization": "Bearer nope"}).status_code == 401


# --- Departments: list ----------------------------------------------------------------------------


@pytest.mark.parametrize("creds", ROLES, ids=["admin", "manager", "employee"])
def test_every_role_lists_departments(client, creds):
    response = client.get("/departments", headers=_auth(client, creds))
    assert response.status_code == 200, response.text
    items = response.json()
    by_prefix = {d["prefix"]: d for d in items}
    assert {"INF", "OPS"} <= set(by_prefix)
    assert by_prefix["INF"]["name"] == "Infrastructure" and by_prefix["OPS"]["name"] == "Operations"
    assert [d["name"] for d in items] == sorted(d["name"] for d in items)  # by name
    for d in items:
        assert set(d) == {"id", "name", "prefix", "next_project_seq", "people", "active_projects"}
        assert d["next_project_seq"] >= 1 and d["people"] >= 0 and d["active_projects"] >= 0
    assert by_prefix["INF"]["people"] >= 4 and by_prefix["INF"]["active_projects"] >= 1


def test_department_counts_match_the_database(client, conn):
    items = client.get("/departments", headers=_auth(client, SEED_EMPLOYEE)).json()
    with conn.cursor() as cur:
        for d in items:
            cur.execute("SELECT count(*) AS n FROM users WHERE department_id = %s AND NOT is_archived", (d["id"],))
            assert d["people"] == cur.fetchone()["n"]
            cur.execute("SELECT count(*) AS n FROM projects WHERE department_id = %s AND status = 'active' AND NOT is_archived", (d["id"],))
            assert d["active_projects"] == cur.fetchone()["n"]
            cur.execute("SELECT next_project_seq FROM departments WHERE id = %s", (d["id"],))
            assert d["next_project_seq"] == cur.fetchone()["next_project_seq"]


def test_departments_need_a_token(client):
    assert client.get("/departments").status_code == 401


# --- Departments: create --------------------------------------------------------------------------


def test_admin_creates_department_with_upper_cased_prefix(client, conn):
    admin = _auth(client, SEED_ADMIN)
    response = client.post("/departments", json={"name": "  Quality Assurance ", "prefix": "qae"}, headers=admin)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["name"] == "Quality Assurance" and body["prefix"] == "QAE"
    assert body["next_project_seq"] == 1 and body["people"] == 0 and body["active_projects"] == 0

    rows = _audit(conn, "department", body["id"])
    assert len(rows) == 1
    assert rows[0]["action"] == "created" and rows[0]["entity_code"] == "QAE"
    assert rows[0]["summary"] == "Created department Quality Assurance (QAE)"
    assert rows[0]["details"] == {"after": {"name": "Quality Assurance", "prefix": "QAE"}}

    # Everyone sees it in the list, and it is offered to the admin's project form.
    assert _department(client, _auth(client, SEED_EMPLOYEE), "QAE")["name"] == "Quality Assurance"
    options = client.get("/projects/options", headers=admin).json()
    assert "QAE" in {d["prefix"] for d in options["departments"]}


@pytest.mark.parametrize(
    ("payload", "field"),
    [
        ({"name": "   ", "prefix": "QAA"}, "name"),
        ({"name": "", "prefix": "QAA"}, "name"),
        ({"prefix": "QAA"}, "name"),
        ({"name": "infrastructure", "prefix": "QAA"}, "name"),
        ({"name": "  OPERATIONS ", "prefix": "QAA"}, "name"),
        ({"name": "Quality Assurance", "prefix": "QAA"}, "name"),
        ({"name": "Design", "prefix": "DE"}, "prefix"),
        ({"name": "Design", "prefix": "DESG"}, "prefix"),
        ({"name": "Design", "prefix": "D1S"}, "prefix"),
        ({"name": "Design", "prefix": "D-S"}, "prefix"),
        ({"name": "Design", "prefix": "ÄBC"}, "prefix"),
        ({"name": "Design", "prefix": "   "}, "prefix"),
        ({"name": "Design"}, "prefix"),
        ({"name": "Design", "prefix": "inf"}, "prefix"),
        ({"name": "Design", "prefix": "qae"}, "prefix"),
    ],
    ids=[
        "blank-name", "empty-name", "missing-name", "name-taken-lower", "name-taken-upper-padded", "name-taken-same",
        "prefix-short", "prefix-long", "prefix-digit", "prefix-punctuation", "prefix-non-ascii", "prefix-blank",
        "prefix-missing", "prefix-taken-seed", "prefix-taken-new",
    ],
)
def test_create_department_validation(client, conn, payload, field):
    admin = _auth(client, SEED_ADMIN)
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM departments")
        before = cur.fetchone()["n"]
    fields = _fields(client.post("/departments", json=payload, headers=admin))
    assert field in fields, fields
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM departments")
        assert cur.fetchone()["n"] == before


def test_create_department_messages(client):
    admin = _auth(client, SEED_ADMIN)
    assert _fields(client.post("/departments", json={"name": "   ", "prefix": "QAB"}, headers=admin)) == {"name": "Department name is required"}
    assert _fields(client.post("/departments", json={"name": "Infrastructure", "prefix": "QAB"}, headers=admin)) == {
        "name": "Another department already has this name"
    }
    assert _fields(client.post("/departments", json={"name": "Design", "prefix": "D1S"}, headers=admin)) == {
        "prefix": "Use exactly three letters, for example INF"
    }
    assert _fields(client.post("/departments", json={"name": "Design", "prefix": "ops"}, headers=admin)) == {
        "prefix": "Another department already uses this prefix"
    }


@pytest.mark.parametrize("creds", [SEED_MANAGER, SEED_EMPLOYEE], ids=["manager", "employee"])
def test_only_admin_creates_or_renames_departments(client, ids, creds):
    headers = _auth(client, creds)
    assert client.post("/departments", json={"name": "Design", "prefix": "DSG"}, headers=headers).status_code == 403
    assert client.patch(f"/departments/{ids['dept_inf']}", json={"name": "Infra"}, headers=headers).status_code == 403
    assert _department(client, headers, "INF")["name"] == "Infrastructure"
    assert "DSG" not in {d["prefix"] for d in client.get("/departments", headers=headers).json()}
    assert client.post("/departments", json={"name": "Design", "prefix": "DSG"}).status_code == 401
    assert client.patch(f"/departments/{ids['dept_inf']}", json={"name": "Infra"}).status_code == 401


# --- Departments: rename and prefix change --------------------------------------------------------


def test_admin_renames_department(client, conn):
    admin = _auth(client, SEED_ADMIN)
    dept = _department(client, admin, "QAE")
    response = client.patch(f"/departments/{dept['id']}", json={"name": "  Quality Engineering "}, headers=admin)
    assert response.status_code == 200, response.text
    assert response.json()["name"] == "Quality Engineering" and response.json()["prefix"] == "QAE"
    assert response.json()["id"] == dept["id"]

    rows = _audit(conn, "department", dept["id"])
    assert [r["action"] for r in rows] == ["created", "updated"]
    assert rows[-1]["entity_code"] == "QAE"
    assert rows[-1]["summary"] == "Updated department Quality Assurance (name)"
    assert rows[-1]["details"] == {"before": {"name": "Quality Assurance"}, "after": {"name": "Quality Engineering"}}


def test_admin_changes_department_prefix(client, conn):
    admin = _auth(client, SEED_ADMIN)
    dept = _department(client, admin, "QAE")
    response = client.patch(f"/departments/{dept['id']}", json={"prefix": "qen"}, headers=admin)
    assert response.status_code == 200, response.text
    assert response.json()["prefix"] == "QEN" and response.json()["name"] == "Quality Engineering"

    rows = _audit(conn, "department", dept["id"])
    assert rows[-1]["action"] == "updated" and rows[-1]["entity_code"] == "QEN"
    assert rows[-1]["summary"] == "Updated department Quality Engineering (prefix)"
    assert rows[-1]["details"] == {"before": {"prefix": "QAE"}, "after": {"prefix": "QEN"}}

    # Both at once: one audit row naming both fields.
    both = client.patch(f"/departments/{dept['id']}", json={"name": "Quality", "prefix": "QLT"}, headers=admin)
    assert both.status_code == 200 and both.json()["name"] == "Quality" and both.json()["prefix"] == "QLT"
    rows = _audit(conn, "department", dept["id"])
    assert rows[-1]["summary"] == "Updated department Quality Engineering (name, prefix)"
    assert rows[-1]["details"]["before"] == {"name": "Quality Engineering", "prefix": "QEN"}
    assert rows[-1]["details"]["after"] == {"name": "Quality", "prefix": "QLT"}
    assert len(rows) == 4


def test_update_department_without_change_writes_no_audit_row(client, conn):
    admin = _auth(client, SEED_ADMIN)
    dept = _department(client, admin, "QLT")
    before = len(_audit(conn, "department", dept["id"]))
    for payload in ({"name": " Quality "}, {"prefix": "qlt"}, {"name": "Quality", "prefix": "QLT"}, {}):
        response = client.patch(f"/departments/{dept['id']}", json=payload, headers=admin)
        assert response.status_code == 200, response.text
        assert response.json()["name"] == "Quality" and response.json()["prefix"] == "QLT"
    assert len(_audit(conn, "department", dept["id"])) == before


def test_update_department_validation(client, conn):
    admin = _auth(client, SEED_ADMIN)
    dept = _department(client, admin, "QLT")
    before = len(_audit(conn, "department", dept["id"]))
    assert _fields(client.patch(f"/departments/{dept['id']}", json={"name": "   "}, headers=admin)) == {"name": "Department name is required"}
    assert "name" in _fields(client.patch(f"/departments/{dept['id']}", json={"name": ""}, headers=admin))
    assert _fields(client.patch(f"/departments/{dept['id']}", json={"name": "OPERATIONS"}, headers=admin)) == {
        "name": "Another department already has this name"
    }
    assert _fields(client.patch(f"/departments/{dept['id']}", json={"prefix": "inf"}, headers=admin)) == {
        "prefix": "Another department already uses this prefix"
    }
    for prefix in ("QL", "QLTY", "Q1T", "   ", ""):
        assert "prefix" in _fields(client.patch(f"/departments/{dept['id']}", json={"prefix": prefix}, headers=admin))
    assert _department(client, admin, "QLT")["name"] == "Quality"
    assert len(_audit(conn, "department", dept["id"])) == before


def test_update_unknown_department_is_404(client):
    admin = _auth(client, SEED_ADMIN)
    response = client.patch("/departments/999999", json={"name": "Ghost"}, headers=admin)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


# --- Departments and project codes ----------------------------------------------------------------


def test_project_in_new_department_gets_its_prefix(client, conn, ids):
    admin = _auth(client, SEED_ADMIN)
    dept = _department(client, admin, "QLT")
    assert dept["next_project_seq"] == 1 and dept["active_projects"] == 0
    today = date.today()
    payload = {
        "name": "Test automation rollout",
        "description": "First project in the new department.",
        "department_id": dept["id"],
        "manager_id": ids["mgr001"],
        "start_date": today.isoformat(),
        "end_date": (today + timedelta(days=60)).isoformat(),
        "budget": 15000,
    }
    response = client.post("/projects", json=payload, headers=admin)
    assert response.status_code == 201, response.text
    assert response.json()["code"] == "QLT-001"

    after = _department(client, admin, "QLT")
    assert after["next_project_seq"] == 2 and after["active_projects"] == 1

    # A later prefix change does not touch the existing code; the next project gets the new prefix.
    assert client.patch(f"/departments/{dept['id']}", json={"prefix": "QLY"}, headers=admin).status_code == 200
    with conn.cursor() as cur:
        cur.execute("SELECT code FROM projects WHERE id = %s", (response.json()["id"],))
        assert cur.fetchone()["code"] == "QLT-001"
    second = client.post("/projects", json={**payload, "name": "Second rollout"}, headers=admin)
    assert second.status_code == 201 and second.json()["code"] == "QLY-002"
    assert _department(client, admin, "QLY")["next_project_seq"] == 3
