"""Facility Admins assigning tickets to engineers, and each engineer's workload."""

import pytest


def _assign(client, api, headers, ticket_id, engineer_id):
    return client.put(
        f"{api}/admin/tickets/{ticket_id}/assignment", json={"engineer_id": engineer_id}, headers=headers
    )


def _stored(run_sql, ticket_id) -> dict:
    return run_sql(
        "SELECT status, assigned_to_user_id, assigned_at, acknowledged_at, updated_at "
        "FROM tickets WHERE ticket_id = %s",
        (ticket_id,),
    )[0]


# --- assign ---------------------------------------------------------------------


def test_assigning_an_open_ticket_acknowledges_it_and_keeps_it_open(
    client, api, admin, jane, create_ticket, engineers, run_sql
) -> None:
    ticket = create_ticket(jane)

    response = _assign(client, api, admin, ticket["ticket_id"], engineers["sam"])

    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["assigned_to_user_id"], body["assigned_to_name"]) == (engineers["sam"], "Sam Tech")
    assert body["status"] == "open"
    assert body["priority"] == "P3"
    assert body["assigned_at"] is not None
    assert body["acknowledged_at"] == body["assigned_at"]
    assert body["updated_at"] > ticket["updated_at"]
    assert _stored(run_sql, ticket["ticket_id"])["assigned_to_user_id"] == engineers["sam"]


def test_the_employee_sees_who_is_on_it(client, api, admin, jane, create_ticket, engineers) -> None:
    ticket = create_ticket(jane)
    _assign(client, api, admin, ticket["ticket_id"], engineers["kim"])

    detail = client.get(f"{api}/tickets/{ticket['ticket_id']}", headers=jane).json()

    assert detail["assigned_to_name"] == "Kim Fixit"
    assert detail["acknowledged_at"] is not None
    assert "priority" not in detail


def test_reassigning_moves_assigned_at_but_keeps_the_first_acknowledgement_and_status(
    client, api, admin, jane, create_ticket, engineers, run_sql
) -> None:
    ticket_id = create_ticket(jane)["ticket_id"]
    _assign(client, api, admin, ticket_id, engineers["sam"])
    # Pretend Sam took it an hour ago and started work.
    run_sql(
        "UPDATE tickets SET status = 'in_progress', assigned_at = assigned_at - interval '1 hour', "
        "acknowledged_at = acknowledged_at - interval '1 hour' WHERE ticket_id = %s",
        (ticket_id,),
    )
    before = _stored(run_sql, ticket_id)

    response = _assign(client, api, admin, ticket_id, engineers["kim"])

    assert response.status_code == 200, response.text
    after = _stored(run_sql, ticket_id)
    assert after["assigned_to_user_id"] == engineers["kim"]
    assert after["status"] == "in_progress"
    assert after["assigned_at"] > before["assigned_at"]
    assert after["acknowledged_at"] == before["acknowledged_at"]


@pytest.mark.parametrize("status", ["in_progress", "blocked"])
def test_unfinished_tickets_in_any_state_can_be_assigned(
    client, api, admin, jane, create_ticket, engineers, run_sql, status
) -> None:
    ticket_id = create_ticket(jane)["ticket_id"]
    run_sql("UPDATE tickets SET status = %s WHERE ticket_id = %s", (status, ticket_id))

    response = _assign(client, api, admin, ticket_id, engineers["sam"])

    assert response.status_code == 200
    assert response.json()["status"] == status


def test_assigning_writes_no_status_history(
    client, api, admin, jane, create_ticket, engineers, run_sql
) -> None:
    ticket_id = create_ticket(jane)["ticket_id"]
    _assign(client, api, admin, ticket_id, engineers["sam"])
    rows = run_sql("SELECT to_status FROM ticket_status_history WHERE ticket_id = %s", (ticket_id,))
    assert [r["to_status"] for r in rows] == ["open"]


@pytest.mark.parametrize(("status", "message"), [
    ("resolved", "Resolved tickets can't be assigned"),
    ("closed", "Closed tickets can't be assigned"),
])
def test_finished_tickets_cannot_be_assigned(
    client, api, admin, jane, create_ticket, engineers, run_sql, status, message
) -> None:
    ticket_id = create_ticket(jane)["ticket_id"]
    run_sql("UPDATE tickets SET status = %s WHERE ticket_id = %s", (status, ticket_id))
    before = _stored(run_sql, ticket_id)

    response = _assign(client, api, admin, ticket_id, engineers["sam"])

    assert response.status_code == 409
    assert response.json() == {"detail": message}
    assert _stored(run_sql, ticket_id) == before


def test_assigning_the_same_engineer_again_is_a_conflict(
    client, api, admin, jane, create_ticket, engineers, run_sql
) -> None:
    ticket_id = create_ticket(jane)["ticket_id"]
    _assign(client, api, admin, ticket_id, engineers["sam"])
    before = _stored(run_sql, ticket_id)

    response = _assign(client, api, admin, ticket_id, engineers["sam"])

    assert response.status_code == 409
    assert response.json() == {"detail": "This ticket is already assigned to Sam Tech"}
    assert _stored(run_sql, ticket_id) == before


@pytest.mark.parametrize("who", ["employee", "admin", "missing"])
def test_only_engineers_can_be_assigned(
    client, api, admin, jane, jane_user, create_ticket, user_with_role, run_sql, who
) -> None:
    ticket_id = create_ticket(jane)["ticket_id"]
    user_id = {
        "employee": jane_user["user_id"],
        "admin": run_sql("SELECT user_id FROM users WHERE email = 'admin@acme.inc'")[0]["user_id"],
        "missing": 999,
    }[who]

    response = _assign(client, api, admin, ticket_id, user_id)

    assert response.status_code == 400
    assert response.json() == {"detail": f"User {user_id} is not an engineer"}
    assert _stored(run_sql, ticket_id)["assigned_to_user_id"] is None


def test_assigning_a_missing_ticket(client, api, admin, engineers) -> None:
    response = _assign(client, api, admin, 999, engineers["sam"])
    assert response.status_code == 404
    assert response.json() == {"detail": "Ticket not found"}


@pytest.mark.parametrize(
    "body", [{}, {"engineer_id": 0}, {"engineer_id": "sam"}, {"engineer_id": 2_147_483_648}]
)
def test_assignment_body_is_validated(client, api, admin, jane, create_ticket, body) -> None:
    ticket_id = create_ticket(jane)["ticket_id"]
    response = client.put(f"{api}/admin/tickets/{ticket_id}/assignment", json=body, headers=admin)
    assert response.status_code == 422


# --- engineers and workload ---------------------------------------------------------


def _workloads(client, api, admin) -> list[dict]:
    response = client.get(f"{api}/admin/engineers", headers=admin)
    assert response.status_code == 200, response.text
    return response.json()


def test_engineers_start_with_no_workload(client, api, admin, engineers, jane_user) -> None:
    workloads = _workloads(client, api, admin)

    # Only engineers, lightest first then by name. Jane (employee) and the admin aren't listed.
    assert [w["full_name"] for w in workloads] == ["Kim Fixit", "Sam Tech"]
    assert workloads[0] == {
        "user_id": engineers["kim"],
        "full_name": "Kim Fixit",
        "email": "kim@acme.inc",
        "active_count": 0,
        "open_count": 0,
        "in_progress_count": 0,
        "blocked_count": 0,
        "p1_count": 0,
    }


def test_workload_counts_only_active_tickets_by_status_and_p1(
    client, api, admin, jane, create_ticket, engineers, run_sql
) -> None:
    building = {"affected_scope": "building", "floor_id": None, "seat_id": None}  # P1
    statuses = ["open", "in_progress", "blocked", "resolved", "closed"]
    for status in statuses:
        ticket_id = create_ticket(jane, **building)["ticket_id"]
        run_sql(
            "UPDATE tickets SET status = %s, assigned_to_user_id = %s WHERE ticket_id = %s",
            (status, engineers["sam"], ticket_id),
        )
    p3 = create_ticket(jane)["ticket_id"]
    _assign(client, api, admin, p3, engineers["sam"])

    sam = next(w for w in _workloads(client, api, admin) if w["user_id"] == engineers["sam"])

    counts = ("active_count", "open_count", "in_progress_count", "blocked_count")
    assert [sam[key] for key in counts] == [4, 2, 1, 1]
    assert sam["p1_count"] == 3


def test_lightest_load_comes_first_then_fewer_p1s(
    client, api, admin, jane, create_ticket, engineers, register, set_role
) -> None:
    ada = register("ada@acme.inc", "Ada Wrench")
    set_role(ada["user_id"], "engineer")
    # Sam: one P3. Kim: one P1. Ada: two P3s.
    _assign(client, api, admin, create_ticket(jane)["ticket_id"], engineers["sam"])
    p1 = create_ticket(jane, affected_scope="building", floor_id=None, seat_id=None)["ticket_id"]
    _assign(client, api, admin, p1, engineers["kim"])
    for _ in range(2):
        _assign(client, api, admin, create_ticket(jane)["ticket_id"], ada["user_id"])

    assert [w["full_name"] for w in _workloads(client, api, admin)] == ["Sam Tech", "Kim Fixit", "Ada Wrench"]


def test_no_engineers_is_an_empty_list(client, api, admin) -> None:
    assert _workloads(client, api, admin) == []
