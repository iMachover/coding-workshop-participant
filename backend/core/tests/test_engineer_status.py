"""Engineers moving their tickets through the workflow: start, block, unblock, resolve, reopen."""

import pytest


@pytest.fixture
def ticket_id(create_ticket, jane, engineers, run_sql) -> int:
    """An open ticket of Jane's, assigned to Sam."""
    ticket_id = create_ticket(jane)["ticket_id"]
    run_sql("UPDATE tickets SET assigned_to_user_id = %s WHERE ticket_id = %s", (engineers["sam"], ticket_id))
    return ticket_id


def _move(client, api, headers, ticket_id, status, reason=None):
    body = {"status": status} if reason is None else {"status": status, "reason": reason}
    return client.post(f"{api}/engineer/tickets/{ticket_id}/status", json=body, headers=headers)


def _set(run_sql, ticket_id, status) -> None:
    run_sql("UPDATE tickets SET status = %s WHERE ticket_id = %s", (status, ticket_id))


def _stored(run_sql, ticket_id) -> dict:
    return run_sql(
        "SELECT status, blocked_reason, resolved_at, updated_at FROM tickets WHERE ticket_id = %s",
        (ticket_id,),
    )[0]


def _history(run_sql, ticket_id) -> list[tuple]:
    rows = run_sql(
        "SELECT from_status, to_status, changed_by_user_id, reason FROM ticket_status_history "
        "WHERE ticket_id = %s ORDER BY history_id",
        (ticket_id,),
    )
    return [(r["from_status"], r["to_status"], r["changed_by_user_id"], r["reason"]) for r in rows]


# --- each move --------------------------------------------------------------------


def test_starting_work_records_who_started_it(client, api, sam, ticket_id, engineers, run_sql) -> None:
    before = _stored(run_sql, ticket_id)

    response = _move(client, api, sam, ticket_id, "in_progress")

    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["status"], body["priority"], body["assigned_to_name"]) == ("in_progress", "P3", "Sam Tech")
    assert _stored(run_sql, ticket_id)["updated_at"] > before["updated_at"]
    assert _history(run_sql, ticket_id)[-1] == ("open", "in_progress", engineers["sam"], None)


def test_blocking_keeps_the_reason_until_unblocked(client, api, sam, ticket_id, engineers, run_sql) -> None:
    _set(run_sql, ticket_id, "in_progress")

    blocked = _move(client, api, sam, ticket_id, "blocked", "  Waiting on a replacement part  ")

    assert blocked.status_code == 200, blocked.text
    body = blocked.json()
    assert (body["status"], body["blocked_reason"]) == ("blocked", "Waiting on a replacement part")
    assert _history(run_sql, ticket_id)[-1] == (
        "in_progress", "blocked", engineers["sam"], "Waiting on a replacement part",
    )

    unblocked = _move(client, api, sam, ticket_id, "in_progress", "Part arrived")

    assert unblocked.status_code == 200
    assert (unblocked.json()["status"], unblocked.json()["blocked_reason"]) == ("in_progress", None)
    assert _history(run_sql, ticket_id)[-1] == ("blocked", "in_progress", engineers["sam"], "Part arrived")


def test_resolving_stamps_resolved_at_and_reopening_clears_it(
    client, api, sam, ticket_id, engineers, run_sql
) -> None:
    _set(run_sql, ticket_id, "in_progress")

    resolved = _move(client, api, sam, ticket_id, "resolved", "Replaced the Wi-Fi card")

    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "resolved"
    assert resolved.json()["resolved_at"] is not None
    assert _history(run_sql, ticket_id)[-1] == (
        "in_progress", "resolved", engineers["sam"], "Replaced the Wi-Fi card",
    )

    reopened = _move(client, api, sam, ticket_id, "in_progress")

    assert reopened.status_code == 200
    assert (reopened.json()["status"], reopened.json()["resolved_at"]) == ("in_progress", None)


def test_the_employee_sees_the_status_and_reasons_but_never_priority(
    client, api, sam, jane, ticket_id, run_sql
) -> None:
    _set(run_sql, ticket_id, "in_progress")
    _move(client, api, sam, ticket_id, "blocked", "Waiting on a replacement part")

    detail = client.get(f"{api}/tickets/{ticket_id}", headers=jane).json()
    history = client.get(f"{api}/tickets/{ticket_id}/history", headers=jane).json()

    assert (detail["status"], detail["blocked_reason"]) == ("blocked", "Waiting on a replacement part")
    assert "priority" not in detail
    assert (history[-1]["to_status"], history[-1]["changed_by_name"], history[-1]["reason"]) == (
        "blocked", "Sam Tech", "Waiting on a replacement part",
    )


def test_the_whole_workflow_is_recorded_in_order(client, api, sam, ticket_id, engineers, run_sql) -> None:
    steps = [
        ("in_progress", None),
        ("blocked", "Waiting on parts"),
        ("in_progress", None),
        ("resolved", "Fixed"),
        ("in_progress", "Came back the next day"),
        ("resolved", "Fixed properly"),
    ]
    for status, reason in steps:
        assert _move(client, api, sam, ticket_id, status, reason).status_code == 200, status

    assert [(f, t, r) for f, t, _, r in _history(run_sql, ticket_id)] == [
        (None, "open", None),
        ("open", "in_progress", None),
        ("in_progress", "blocked", "Waiting on parts"),
        ("blocked", "in_progress", None),
        ("in_progress", "resolved", "Fixed"),
        ("resolved", "in_progress", "Came back the next day"),
        ("in_progress", "resolved", "Fixed properly"),
    ]


def test_workload_follows_the_status(client, api, sam, admin, ticket_id, engineers, run_sql) -> None:
    _set(run_sql, ticket_id, "in_progress")
    _move(client, api, sam, ticket_id, "blocked", "Waiting on parts")

    workload = client.get(f"{api}/admin/engineers", headers=admin).json()
    sam_load = next(w for w in workload if w["user_id"] == engineers["sam"])
    assert (sam_load["active_count"], sam_load["blocked_count"]) == (1, 1)


# --- refused moves ----------------------------------------------------------------


@pytest.mark.parametrize(
    ("current", "target", "message"),
    [
        ("open", "blocked", "Open tickets can't be blocked. Start work first."),
        ("open", "resolved", "Open tickets can't be resolved. Start work first."),
        ("blocked", "resolved", "Blocked tickets can't be resolved. Unblock it first."),
        ("resolved", "blocked", "Resolved tickets can't be blocked. Reopen it first."),
        ("in_progress", "in_progress", "This ticket is already in progress"),
        ("blocked", "blocked", "This ticket is already blocked"),
        ("resolved", "resolved", "This ticket is already resolved"),
        ("closed", "in_progress", "Closed tickets can't change status"),
        ("closed", "resolved", "Closed tickets can't change status"),
    ],
)
def test_moves_the_workflow_does_not_allow(
    client, api, sam, ticket_id, run_sql, current, target, message
) -> None:
    _set(run_sql, ticket_id, current)
    history_before = _history(run_sql, ticket_id)

    response = _move(client, api, sam, ticket_id, target, "A reason")

    assert response.status_code == 409
    assert response.json() == {"detail": message}
    assert _stored(run_sql, ticket_id)["status"] == current
    assert _history(run_sql, ticket_id) == history_before


@pytest.mark.parametrize(
    "body",
    [
        {"status": "blocked"},
        {"status": "resolved"},
        {"status": "blocked", "reason": "   "},
        {"status": "resolved", "reason": "x" * 501},
        {"status": "open"},
        {"status": "closed", "reason": "Done"},
        {"status": "done"},
        {},
    ],
)
def test_bad_requests_are_422(client, api, sam, ticket_id, run_sql, body) -> None:
    _set(run_sql, ticket_id, "in_progress")
    response = client.post(f"{api}/engineer/tickets/{ticket_id}/status", json=body, headers=sam)
    assert response.status_code == 422
    assert _stored(run_sql, ticket_id)["status"] == "in_progress"


def test_the_missing_reason_is_explained(client, api, sam, ticket_id, run_sql) -> None:
    _set(run_sql, ticket_id, "in_progress")
    response = _move(client, api, sam, ticket_id, "blocked")
    assert response.json()["detail"][0]["msg"] == "Value error, A reason is required to mark a ticket blocked"


@pytest.mark.parametrize("owner", ["kim", "nobody", "missing"])
def test_only_my_tickets_can_be_moved(client, api, sam, ticket_id, engineers, run_sql, owner) -> None:
    assignee = {"kim": engineers["kim"], "nobody": None}.get(owner)
    run_sql("UPDATE tickets SET assigned_to_user_id = %s WHERE ticket_id = %s", (assignee, ticket_id))
    target = 999 if owner == "missing" else ticket_id

    response = _move(client, api, sam, target, "in_progress")

    assert response.status_code == 404
    assert response.json() == {"detail": "Ticket not found"}
    assert _stored(run_sql, ticket_id)["status"] == "open"
