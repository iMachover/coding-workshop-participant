"""Facility Admins finishing resolved tickets (close, or send back), and the dashboard's counts."""

import pytest


@pytest.fixture
def resolved_id(create_ticket, jane, engineers, run_sql) -> int:
    """A ticket of Jane's that Sam has resolved."""
    ticket_id = create_ticket(jane)["ticket_id"]
    run_sql(
        "UPDATE tickets SET assigned_to_user_id = %s, status = 'resolved', resolved_at = now() "
        "WHERE ticket_id = %s",
        (engineers["sam"], ticket_id),
    )
    return ticket_id


def _finish(client, api, admin, ticket_id, status, reason=None):
    body = {"status": status} if reason is None else {"status": status, "reason": reason}
    return client.post(f"{api}/admin/tickets/{ticket_id}/status", json=body, headers=admin)


def _admin_id(run_sql) -> int:
    return run_sql("SELECT user_id FROM users WHERE email = 'admin@acme.inc'")[0]["user_id"]


def _column(run_sql, ticket_id, column):
    """One column of a ticket row, straight from the table."""
    query = {
        "status": "SELECT status AS value FROM tickets WHERE ticket_id = %s",
        "resolved_at": "SELECT resolved_at AS value FROM tickets WHERE ticket_id = %s",
    }[column]
    return run_sql(query, (ticket_id,))[0]["value"]


def _last_change(run_sql, ticket_id) -> tuple:
    row = run_sql(
        "SELECT from_status, to_status, changed_by_user_id, reason FROM ticket_status_history "
        "WHERE ticket_id = %s ORDER BY history_id DESC LIMIT 1",
        (ticket_id,),
    )[0]
    return (row["from_status"], row["to_status"], row["changed_by_user_id"], row["reason"])


# --- close ------------------------------------------------------------------------


@pytest.mark.parametrize("note", [None, "  Confirmed with Jane  "])
def test_closing_a_resolved_ticket_keeps_when_it_was_resolved(
    client, api, admin, resolved_id, run_sql, note
) -> None:
    resolved_at = _column(run_sql, resolved_id, "resolved_at")

    response = _finish(client, api, admin, resolved_id, "closed", note)

    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["status"], body["assigned_to_name"]) == ("closed", "Sam Tech")
    assert _column(run_sql, resolved_id, "resolved_at") == resolved_at
    expected_note = note.strip() if note else None
    assert _last_change(run_sql, resolved_id) == ("resolved", "closed", _admin_id(run_sql), expected_note)


def test_a_closed_ticket_is_done_for_everyone(client, api, admin, sam, jane, resolved_id) -> None:
    _finish(client, api, admin, resolved_id, "closed")

    detail = client.get(f"{api}/tickets/{resolved_id}", headers=jane).json()
    history = client.get(f"{api}/tickets/{resolved_id}/history", headers=jane).json()
    assert detail["status"] == "closed"
    assert (history[-1]["to_status"], history[-1]["changed_by_role"]) == ("closed", "admin")

    # No more notes or status changes from the employee or the engineer.
    note = client.post(f"{api}/tickets/{resolved_id}/notes", json={"note_text": "Thanks"}, headers=jane)
    move = client.post(
        f"{api}/engineer/tickets/{resolved_id}/status", json={"status": "in_progress"}, headers=sam
    )
    assert (note.status_code, move.status_code) == (409, 409)


# --- send back --------------------------------------------------------------------


def test_sending_back_returns_the_work_to_the_same_engineer(
    client, api, admin, sam, resolved_id, engineers, run_sql
) -> None:
    response = _finish(client, api, admin, resolved_id, "in_progress", "The lights still flicker")

    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["status"], body["resolved_at"], body["assigned_to_user_id"]) == (
        "in_progress", None, engineers["sam"],
    )
    assert _last_change(run_sql, resolved_id) == (
        "resolved", "in_progress", _admin_id(run_sql), "The lights still flicker",
    )
    queue = client.get(f"{api}/engineer/tickets", headers=sam, params={"status": "in_progress"}).json()
    assert [t["ticket_id"] for t in queue] == [resolved_id]


def test_sending_back_to_someone_no_longer_an_engineer(
    client, api, admin, resolved_id, engineers, set_role, run_sql
) -> None:
    set_role(engineers["sam"], "employee")

    response = _finish(client, api, admin, resolved_id, "in_progress", "Still broken")

    assert response.status_code == 409
    assert response.json() == {
        "detail": "Sam Tech is no longer an engineer, so it can't go back to them. "
        "Close it, or make them an engineer again."
    }
    assert _column(run_sql, resolved_id, "status") == "resolved"


# --- refused ----------------------------------------------------------------------


@pytest.mark.parametrize(
    ("current", "target", "message"),
    [
        ("open", "closed", "Only resolved tickets can be closed"),
        ("in_progress", "closed", "Only resolved tickets can be closed"),
        ("blocked", "closed", "Only resolved tickets can be closed"),
        ("in_progress", "in_progress", "Only resolved tickets can be sent back"),
        ("closed", "closed", "This ticket is already closed"),
        ("closed", "in_progress", "This ticket is already closed"),
    ],
)
def test_only_resolved_tickets_can_be_finished(
    client, api, admin, resolved_id, run_sql, current, target, message
) -> None:
    run_sql("UPDATE tickets SET status = %s WHERE ticket_id = %s", (current, resolved_id))

    response = _finish(client, api, admin, resolved_id, target, "A reason")

    assert response.status_code == 409
    assert response.json() == {"detail": message}
    assert _column(run_sql, resolved_id, "status") == current


@pytest.mark.parametrize(
    "body",
    [
        {"status": "in_progress"},
        {"status": "in_progress", "reason": "  "},
        {"status": "open"},
        {"status": "resolved"},
        {"status": "blocked", "reason": "x"},
        {"status": "closed", "reason": "x" * 501},
        {},
    ],
)
def test_bad_requests_are_422(client, api, admin, resolved_id, body) -> None:
    response = client.post(f"{api}/admin/tickets/{resolved_id}/status", json=body, headers=admin)
    assert response.status_code == 422


def test_finishing_a_missing_ticket(client, api, admin) -> None:
    response = _finish(client, api, admin, 999, "closed")
    assert response.status_code == 404
    assert response.json() == {"detail": "Ticket not found"}


# --- metrics ----------------------------------------------------------------------


def test_metrics_with_no_tickets_are_all_zero(client, api, admin) -> None:
    response = client.get(f"{api}/admin/metrics", headers=admin)
    assert response.status_code == 200
    assert set(response.json().values()) == {0}


def test_metrics_count_each_kind_of_ticket(
    client, api, admin, jane, create_ticket, engineers, run_sql
) -> None:
    building = {"affected_scope": "building", "floor_id": None, "seat_id": None}  # P1
    rows = [
        # status, P1?, assigned?, escalated?
        ("open", True, False, True),
        ("open", False, True, False),
        ("in_progress", True, True, False),
        ("blocked", False, True, True),
        ("resolved", True, True, False),
        ("closed", True, True, True),
        ("closed", False, True, False),
    ]
    for status, p1, assigned, escalated in rows:
        ticket_id = create_ticket(jane, **(building if p1 else {}))["ticket_id"]
        run_sql(
            "UPDATE tickets SET status = %s, assigned_to_user_id = %s, escalation_requested = %s "
            "WHERE ticket_id = %s",
            (status, engineers["sam"] if assigned else None, escalated, ticket_id),
        )

    metrics = client.get(f"{api}/admin/metrics", headers=admin).json()

    assert metrics == {
        "unassigned": 1,
        "open": 2,
        "in_progress": 1,
        "blocked": 1,
        "resolved": 1,
        "active_p1": 3,
        "escalated": 2,
        "closed": 2,
    }


def test_closing_through_the_api_counts_as_closed(client, api, admin, resolved_id) -> None:
    _finish(client, api, admin, resolved_id, "closed")
    metrics = client.get(f"{api}/admin/metrics", headers=admin).json()
    assert (metrics["resolved"], metrics["closed"]) == (0, 1)
