"""Task and milestone workflow: forward-only status, one active milestone, review, approval, notes."""

from datetime import timedelta

import pytest

from tests.conftest import SEED_ADMIN, SEED_EMPLOYEE, SEED_MANAGER, login

MANAGER_2 = {"username": "mgr002", "password": "Manager123!"}
EMPLOYEE_2 = {"username": "emp002", "password": "Employee123!"}
EMPLOYEE_3 = {"username": "emp003", "password": "Employee123!"}
EMPLOYEE_4 = {"username": "emp004", "password": "Employee123!"}


def _auth(client, creds):
    return {"Authorization": f"Bearer {login(client, **creds)}"}


def _task_id(conn, title):
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM tasks WHERE title = %s", (title,))
        return cur.fetchone()["id"]


def _milestone_id(conn, name):
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM milestones WHERE name = %s", (name,))
        return cur.fetchone()["id"]


def _milestone_dates(conn, milestone_id):
    with conn.cursor() as cur:
        cur.execute("SELECT start_date, projected_end_date FROM milestones WHERE id = %s", (milestone_id,))
        row = cur.fetchone()
        return row["start_date"], row["projected_end_date"]


def _project_id(conn, code):
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM projects WHERE code = %s", (code,))
        return cur.fetchone()["id"]


def _user_id(conn, username):
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE username = %s", (username,))
        return cur.fetchone()["id"]


def _audit(conn, entity_type, entity_id):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT action, summary FROM audit_log WHERE entity_type = %s AND entity_id = %s ORDER BY id",
            (entity_type, entity_id),
        )
        return cur.fetchall()


# --- Reading tasks ----------------------------------------------------------------------------


def test_task_requires_token(client, conn):
    assert client.get(f"/tasks/{_task_id(conn, 'Migrate file services to new cluster')}").status_code == 401


def test_employee_reads_own_task_with_actions(client, conn):
    body = client.get(f"/tasks/{_task_id(conn, 'Migrate file services to new cluster')}", headers=_auth(client, SEED_EMPLOYEE)).json()
    assert body["status"] == "in_progress" and body["display_status"] == "in_progress"
    assert body["can_submit"] is True and body["can_start"] is False and body["can_review"] is False
    # Cost = hours x the assignee's rate ($60) + the resources' costs (MANAGER.md §2).
    resources = body["resources"]
    assert resources[0]["name"] == "Migration tool licence"
    assert body["planned_cost"] == pytest.approx(body["planned_hours"] * 60 + sum(r["estimated_cost"] for r in resources))
    assert body["actual_cost"] == pytest.approx(body["actual_hours"] * 60 + sum(r["actual_cost"] or 0 for r in resources))


def test_employee_cannot_read_someone_elses_task(client, conn):
    task = _task_id(conn, "Cut over DNS and load balancer")  # emp002's
    assert client.get(f"/tasks/{task}", headers=_auth(client, SEED_EMPLOYEE)).status_code == 404


def test_manager_reads_tasks_on_own_projects_only(client, conn):
    task = _task_id(conn, "Cut over DNS and load balancer")
    body = client.get(f"/tasks/{task}", headers=_auth(client, SEED_MANAGER)).json()
    assert body["can_review"] is True and body["assignee_name"] == "Priya Natarajan"
    assert client.get(f"/tasks/{task}", headers=_auth(client, MANAGER_2)).status_code == 404
    assert client.get(f"/tasks/{task}", headers=_auth(client, SEED_ADMIN)).status_code == 200


def test_blocked_and_queued_display_states(client, conn):
    blocked = client.get(f"/tasks/{_task_id(conn, 'Wipe and certify drives')}", headers=_auth(client, EMPLOYEE_3)).json()
    assert blocked["display_status"] == "blocked" and blocked["can_start"] is False
    assert "Blocked" in blocked["blocked_reason"]


# --- Employee moves work forward --------------------------------------------------------------


def test_employee_starts_then_submits_a_task(client, conn):
    task = _task_id(conn, "Validate backups after migration")  # emp003, milestone 2, nothing active yet
    headers = _auth(client, EMPLOYEE_3)
    started = client.patch(f"/tasks/{task}", json={"status": "in_progress"}, headers=headers)
    assert started.status_code == 200, started.text
    assert started.json()["status"] == "in_progress" and started.json()["started_at"]

    # Starting a task in a locked milestone is refused even now.
    locked = _task_id(conn, "Wipe and certify drives")
    refused = client.patch(f"/tasks/{locked}", json={"status": "in_progress"}, headers=headers)
    assert refused.status_code == 409 and "locked" in refused.json()["error"]["message"]

    submitted = client.patch(f"/tasks/{task}", json={"status": "submitted"}, headers=headers)
    assert submitted.status_code == 200 and submitted.json()["submitted_at"]
    assert submitted.json()["display_status"] == "submitted"
    assert [a["action"] for a in _audit(conn, "task", task)] == ["started", "submitted"]

    # Forward only.
    assert client.patch(f"/tasks/{task}", json={"status": "in_progress"}, headers=headers).status_code == 409
    assert client.patch(f"/tasks/{task}", json={"status": "submitted"}, headers=headers).status_code == 409
    assert client.patch(f"/tasks/{task}", json={"status": "completed"}, headers=headers).status_code == 400


def test_submit_requires_in_progress(client, conn):
    task = _task_id(conn, "Update runbooks for migrated services")  # emp001, assigned
    response = client.patch(f"/tasks/{task}", json={"status": "submitted"}, headers=_auth(client, SEED_EMPLOYEE))
    assert response.status_code == 409


def test_only_the_assignee_moves_a_task(client, conn):
    task = _task_id(conn, "Update runbooks for migrated services")
    assert client.patch(f"/tasks/{task}", json={"status": "in_progress"}, headers=_auth(client, EMPLOYEE_2)).status_code == 404
    assert client.patch(f"/tasks/{task}", json={"status": "in_progress"}, headers=_auth(client, SEED_MANAGER)).status_code == 403


def test_one_active_milestone_across_projects(client, conn):
    """emp004 is working in OPS-018. Put them on the INF team, give them an INF task: it is Queued."""
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO team_members (team_id, user_id) SELECT t.id, %s FROM teams t WHERE t.name = 'Server Ops' ON CONFLICT DO NOTHING",
            (_user_id(conn, "emp004"),),
        )
        conn.commit()
    milestone = _milestone_id(conn, "Workload migration")
    created = client.post(
        f"/milestones/{milestone}/tasks",
        json={"title": "Label migrated racks", "predicted_hours": 4, "assigned_to": _user_id(conn, "emp004")},
        headers=_auth(client, SEED_MANAGER),
    )
    assert created.status_code == 201, created.text
    task = created.json()
    assert task["code"].startswith("TSK-") and task["display_status"] == "queued"
    assert "Physical audit" in task["blocked_reason"]

    refused = client.patch(f"/tasks/{task['id']}", json={"status": "in_progress"}, headers=_auth(client, EMPLOYEE_4))
    assert refused.status_code == 409
    assert "Physical audit" in refused.json()["error"]["message"]


# --- Manager plans and reviews ----------------------------------------------------------------


def test_manager_creates_task_for_someone_on_the_project(client, conn):
    milestone = _milestone_id(conn, "Workload migration")
    headers = _auth(client, SEED_MANAGER)
    ms_start, ms_end = _milestone_dates(conn, milestone)
    response = client.post(
        f"/milestones/{milestone}/tasks",
        json={"title": "Verify firewall rules", "description": "Check every migrated service.", "predicted_hours": 6, "due_date": ms_end.isoformat(), "assigned_to": _user_id(conn, "emp001")},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["assignee_name"] == "Sam Rivera" and body["planned_cost"] == 6 * 60
    assert _audit(conn, "task", body["id"])[0]["action"] == "created"

    # The due date must fall within the milestone's dates.
    for due in (ms_start - timedelta(days=1), ms_end + timedelta(days=1)):
        early_or_late = client.post(f"/milestones/{milestone}/tasks", json={"title": "x", "due_date": due.isoformat(), "assigned_to": _user_id(conn, "emp001")}, headers=headers)
        assert early_or_late.status_code == 400 and "milestone dates" in early_or_late.json()["error"]["fields"]["due_date"]

    # Assignee must be on a team attached to this project (emp002 is on Server Ops; a stranger is not).
    with conn.cursor() as cur:
        cur.execute("DELETE FROM team_members WHERE user_id = %s", (_user_id(conn, "emp004"),))
        conn.commit()
    bad = client.post(f"/milestones/{milestone}/tasks", json={"title": "x", "assigned_to": _user_id(conn, "emp004")}, headers=headers)
    assert bad.status_code == 400 and "assigned_to" in bad.json()["error"]["fields"]
    # Not in an approved milestone, not on another manager's project, never an employee.
    done = _milestone_id(conn, "Inventory and dependency mapping")
    assert client.post(f"/milestones/{done}/tasks", json={"title": "x", "assigned_to": _user_id(conn, "emp001")}, headers=headers).status_code == 409
    assert client.post(f"/milestones/{milestone}/tasks", json={"title": "x", "assigned_to": _user_id(conn, "emp001")}, headers=_auth(client, MANAGER_2)).status_code == 403
    assert client.post(f"/milestones/{milestone}/tasks", json={"title": "x", "assigned_to": _user_id(conn, "emp001")}, headers=_auth(client, SEED_EMPLOYEE)).status_code == 403


def test_manager_completes_and_reopens_submitted_task(client, conn):
    task = _task_id(conn, "Cut over DNS and load balancer")  # emp002, submitted, on INF-024
    assert client.post(f"/tasks/{task}/complete", headers=_auth(client, MANAGER_2)).status_code == 403
    assert client.post(f"/tasks/{task}/complete", headers=_auth(client, EMPLOYEE_2)).status_code == 403
    assert client.post(f"/tasks/{task}/complete", headers=_auth(client, SEED_ADMIN)).status_code == 403

    headers = _auth(client, SEED_MANAGER)
    done = client.post(f"/tasks/{task}/complete", headers=headers)
    assert done.status_code == 200, done.text
    assert done.json()["status"] == "completed" and done.json()["completed_at"]
    assert client.post(f"/tasks/{task}/complete", headers=headers).status_code == 409

    reopened = client.post(f"/tasks/{task}/reopen", headers=headers)
    assert reopened.status_code == 200
    body = reopened.json()
    assert body["status"] == "in_progress" and body["submitted_at"] is None and body["completed_at"] is None
    assert body["started_at"] is not None
    assert [a["action"] for a in _audit(conn, "task", task)][-2:] == ["completed", "reopened"]

    # Can't complete something that was never submitted.
    assigned = _task_id(conn, "Update runbooks for migrated services")
    assert client.post(f"/tasks/{assigned}/complete", headers=headers).status_code == 409
    # Put the seed task back as submitted for the other tests.
    assert client.patch(f"/tasks/{task}", json={"status": "submitted"}, headers=_auth(client, EMPLOYEE_2)).status_code == 200


# --- Milestones -------------------------------------------------------------------------------


def test_milestone_detail_is_scoped_by_role(client, conn):
    milestone = _milestone_id(conn, "Workload migration")
    mine = client.get(f"/milestones/{milestone}", headers=_auth(client, SEED_EMPLOYEE)).json()
    assert {t["assignee_name"] for t in mine["tasks"]} == {"Sam Rivera"}
    assert mine["assignable"] == [] and mine["approve_blocker"] is None

    managed = client.get(f"/milestones/{milestone}", headers=_auth(client, SEED_MANAGER)).json()
    assert len(managed["tasks"]) > len(mine["tasks"])
    assert managed["can_approve"] is False and "not completed" in managed["approve_blocker"]
    assert {p["name"] for p in managed["assignable"]} >= {"Sam Rivera", "Priya Natarajan"}
    assert managed["progress"]["total"] == len(managed["tasks"])
    assert managed["notes"] and managed["notes"][0]["author_name"]

    assert client.get(f"/milestones/{milestone}", headers=_auth(client, MANAGER_2)).status_code == 404
    assert client.get(f"/milestones/{milestone}", headers=_auth(client, SEED_ADMIN)).status_code == 200


def test_manager_adds_dependent_milestone(client, conn):
    project = _project_id(conn, "INF-024")
    headers = _auth(client, SEED_MANAGER)
    response = client.post(f"/projects/{project}/milestones", json={"name": "Post-migration review", "predicted_hours": 20}, headers=headers)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["sequence"] == 4 and body["locked"] is True and body["status"] == "not_started"
    assert _audit(conn, "milestone", body["id"])[0]["action"] == "created"

    # Dates stay inside the project's dates and clear of other milestones (seeded ones fill INF-024).
    with conn.cursor() as cur:
        cur.execute("SELECT start_date, end_date FROM projects WHERE id = %s", (project,))
        p_start, p_end = cur.fetchone().values()
    outside = client.post(f"/projects/{project}/milestones", json={"name": "x", "start_date": (p_start - timedelta(days=1)).isoformat()}, headers=headers)
    assert outside.status_code == 400 and "project dates" in outside.json()["error"]["fields"]["start_date"]
    outside = client.post(f"/projects/{project}/milestones", json={"name": "x", "projected_end_date": (p_end + timedelta(days=1)).isoformat()}, headers=headers)
    assert outside.status_code == 400 and "project dates" in outside.json()["error"]["fields"]["projected_end_date"]
    ms_start, ms_end = _milestone_dates(conn, _milestone_id(conn, "Workload migration"))
    overlap = client.post(f"/projects/{project}/milestones", json={"name": "x", "start_date": ms_end.isoformat(), "projected_end_date": ms_end.isoformat()}, headers=headers)
    assert overlap.status_code == 400 and "Overlaps milestone 02" in overlap.json()["error"]["fields"]["start_date"]

    bad = client.post(f"/projects/{project}/milestones", json={"name": "x", "start_date": "2027-03-01", "projected_end_date": "2027-02-01"}, headers=headers)
    assert bad.status_code == 400 and "projected_end_date" in bad.json()["error"]["fields"]
    assert client.post(f"/projects/{project}/milestones", json={"name": "x"}, headers=_auth(client, MANAGER_2)).status_code == 403
    assert client.post(f"/projects/{project}/milestones", json={"name": "x"}, headers=_auth(client, SEED_EMPLOYEE)).status_code == 403
    assert client.post(f"/projects/{project}/milestones", json={"name": "x"}, headers=_auth(client, SEED_ADMIN)).status_code == 403


def test_approve_milestone_needs_every_task_completed(client, conn):
    headers = _auth(client, SEED_MANAGER)
    current = _milestone_id(conn, "Workload migration")
    response = client.post(f"/milestones/{current}/approve", headers=headers)
    assert response.status_code == 409 and "not completed" in response.json()["error"]["message"]
    locked = _milestone_id(conn, "Decommission and disposal")
    assert "before this one" in client.post(f"/milestones/{locked}/approve", headers=headers).json()["error"]["message"]
    done = _milestone_id(conn, "Inventory and dependency mapping")
    assert client.post(f"/milestones/{done}/approve", headers=headers).status_code == 409


def test_full_loop_approve_milestones_and_close_project(client, conn):
    """OPS-018: finish every task, approve both milestones in order, close the project."""
    employee = _auth(client, EMPLOYEE_4)
    manager = _auth(client, MANAGER_2)
    project = _project_id(conn, "OPS-018")
    first = _milestone_id(conn, "Physical audit")
    second = _milestone_id(conn, "Reconcile asset register")

    assert client.post(f"/projects/{project}/close", headers=manager).status_code == 409

    def finish(title):
        task = _task_id(conn, title)
        state = client.get(f"/tasks/{task}", headers=employee).json()["status"]
        if state == "assigned":
            assert client.patch(f"/tasks/{task}", json={"status": "in_progress"}, headers=employee).status_code == 200
        if state in ("assigned", "in_progress"):
            assert client.patch(f"/tasks/{task}", json={"status": "submitted"}, headers=employee).status_code == 200
        assert client.post(f"/tasks/{task}/complete", headers=manager).status_code == 200

    finish("Scan asset tags in datacenter A")
    finish("Scan asset tags in datacenter B")
    approved = client.post(f"/milestones/{first}/approve", headers=manager)
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "completed" and approved.json()["completed_at"]

    # The next milestone is unlocked now; a task in an approved milestone cannot be reopened.
    assert client.get(f"/milestones/{second}", headers=manager).json()["locked"] is False
    assert client.post(f"/tasks/{_task_id(conn, 'Scan asset tags in datacenter A')}/reopen", headers=manager).status_code == 409

    closing = client.post(f"/projects/{project}/close", headers=manager)
    assert closing.status_code == 409 and "1 of 2" in closing.json()["error"]["message"]

    finish("Reconcile register against scans")
    assert client.post(f"/milestones/{second}/approve", headers=manager).status_code == 200
    closed = client.post(f"/projects/{project}/close", headers=manager)
    assert closed.status_code == 200 and closed.json()["status"] == "closed"
    assert _audit(conn, "project", project)[-1]["action"] == "closed"

    # Closed projects accept no more work.
    assert client.post(f"/projects/{project}/milestones", json={"name": "x"}, headers=manager).status_code == 409
    assert client.post(f"/projects/{project}/close", headers=manager).status_code == 409


# --- Notes ------------------------------------------------------------------------------------


def test_people_on_the_project_add_notes(client, conn):
    milestone = _milestone_id(conn, "Workload migration")
    before = len(client.get(f"/milestones/{milestone}", headers=_auth(client, SEED_EMPLOYEE)).json()["notes"])
    response = client.post(f"/milestones/{milestone}/notes", json={"note_text": "  Cluster B is ready for cut-over.  "}, headers=_auth(client, SEED_EMPLOYEE))
    assert response.status_code == 201, response.text
    notes = response.json()["notes"]
    assert len(notes) == before + 1
    assert notes[-1]["note_text"] == "Cluster B is ready for cut-over." and notes[-1]["author_role"] == "employee"

    reply = client.post(f"/milestones/{milestone}/notes", json={"note_text": "Thanks, go ahead."}, headers=_auth(client, SEED_MANAGER))
    assert reply.status_code == 201 and reply.json()["notes"][-1]["author_role"] == "manager"
    assert _audit(conn, "milestone", milestone)[-1]["action"] == "noted"

    assert client.post(f"/milestones/{milestone}/notes", json={"note_text": "x"}, headers=_auth(client, MANAGER_2)).status_code == 404
    assert client.post(f"/milestones/{milestone}/notes", json={"note_text": "x"}, headers=_auth(client, SEED_ADMIN)).status_code == 403
    assert client.post(f"/milestones/{milestone}/notes", json={"note_text": ""}, headers=_auth(client, SEED_EMPLOYEE)).status_code == 400
