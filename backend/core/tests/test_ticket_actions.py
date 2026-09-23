"""Notes and escalation on the caller's tickets."""

import pytest


@pytest.fixture
def ticket(create_ticket, jane) -> dict:
    """An open ticket owned by Jane."""
    return create_ticket(jane)


def _updated_at(run_sql, ticket_id: int):
    return run_sql("SELECT updated_at FROM tickets WHERE ticket_id = %s", (ticket_id,))[0]["updated_at"]


def _close(run_sql, ticket_id: int) -> None:
    run_sql("UPDATE tickets SET status = 'closed' WHERE ticket_id = %s", (ticket_id,))


# --- notes --------------------------------------------------------------------


def test_add_note(client, api, jane, ticket) -> None:
    response = client.post(
        f"{api}/tickets/{ticket['ticket_id']}/notes",
        json={"note_text": "  Still happening.  "},
        headers=jane,
    )
    assert response.status_code == 201
    note = response.json()
    assert note["note_text"] == "Still happening."
    assert (note["author_name"], note["author_role"]) == ("Jane Doe", "employee")
    assert note["ticket_id"] == ticket["ticket_id"]


def test_add_note_bumps_ticket_updated_at(client, api, jane, ticket, run_sql) -> None:
    before = _updated_at(run_sql, ticket["ticket_id"])
    client.post(f"{api}/tickets/{ticket['ticket_id']}/notes", json={"note_text": "hi"}, headers=jane)
    assert _updated_at(run_sql, ticket["ticket_id"]) > before


def test_notes_are_listed_oldest_first_with_authors(
    client, api, jane, ticket, register, set_role, run_sql
) -> None:
    sam = register("sam@acme.inc", "Sam Tech")
    set_role(sam["user_id"], "engineer")
    url = f"{api}/tickets/{ticket['ticket_id']}/notes"
    client.post(url, json={"note_text": "first"}, headers=jane)
    run_sql(
        "INSERT INTO ticket_notes (ticket_id, user_id, note_text) VALUES (%s, %s, 'second')",
        (ticket["ticket_id"], sam["user_id"]),
    )

    notes = client.get(url, headers=jane).json()

    assert [(n["note_text"], n["author_name"], n["author_role"]) for n in notes] == [
        ("first", "Jane Doe", "employee"),
        ("second", "Sam Tech", "engineer"),
    ]


def test_closed_ticket_rejects_notes_but_keeps_history(client, api, jane, ticket, run_sql) -> None:
    url = f"{api}/tickets/{ticket['ticket_id']}/notes"
    client.post(url, json={"note_text": "before closing"}, headers=jane)
    _close(run_sql, ticket["ticket_id"])

    response = client.post(url, json={"note_text": "after closing"}, headers=jane)

    assert response.status_code == 409
    assert response.json() == {"detail": "Closed tickets can't take new notes"}
    assert [n["note_text"] for n in client.get(url, headers=jane).json()] == ["before closing"]


@pytest.mark.parametrize("body", [{"note_text": "   "}, {"note_text": "x" * 2001}, {}])
def test_invalid_notes_are_422(client, api, jane, ticket, body) -> None:
    url = f"{api}/tickets/{ticket['ticket_id']}/notes"
    assert client.post(url, json=body, headers=jane).status_code == 422


def test_notes_on_someone_elses_ticket_are_404(client, api, eve, ticket, run_sql) -> None:
    url = f"{api}/tickets/{ticket['ticket_id']}/notes"
    assert client.get(url, headers=eve).status_code == 404
    assert client.post(url, json={"note_text": "hi"}, headers=eve).status_code == 404
    assert run_sql("SELECT count(*) AS n FROM ticket_notes")[0]["n"] == 0


# --- escalation ---------------------------------------------------------------


def test_request_escalation(client, api, jane, ticket, run_sql) -> None:
    before = _updated_at(run_sql, ticket["ticket_id"])
    response = client.post(
        f"{api}/tickets/{ticket['ticket_id']}/escalation",
        json={"reason": "  Whole floor is down.  "},
        headers=jane,
    )
    assert response.status_code == 200
    detail = response.json()
    assert detail["escalation_requested"] is True
    assert detail["escalation_reason"] == "Whole floor is down."
    assert detail["building_name"] == "Building A"
    assert _updated_at(run_sql, ticket["ticket_id"]) > before


def test_escalation_only_once(client, api, jane, ticket) -> None:
    url = f"{api}/tickets/{ticket['ticket_id']}/escalation"
    client.post(url, json={"reason": "first"}, headers=jane)
    response = client.post(url, json={"reason": "again"}, headers=jane)
    assert response.status_code == 409
    assert response.json() == {"detail": "Escalation has already been requested for this ticket"}


def test_closed_ticket_cannot_be_escalated(client, api, jane, ticket, run_sql) -> None:
    _close(run_sql, ticket["ticket_id"])
    response = client.post(
        f"{api}/tickets/{ticket['ticket_id']}/escalation", json={"reason": "x"}, headers=jane
    )
    assert response.status_code == 409
    assert response.json() == {"detail": "Closed tickets can't be escalated"}


def test_resolved_ticket_can_still_be_escalated(client, api, jane, ticket, run_sql) -> None:
    run_sql("UPDATE tickets SET status = 'resolved' WHERE ticket_id = %s", (ticket["ticket_id"],))
    response = client.post(
        f"{api}/tickets/{ticket['ticket_id']}/escalation", json={"reason": "Not fixed"}, headers=jane
    )
    assert response.status_code == 200


@pytest.mark.parametrize("body", [{"reason": "  "}, {"reason": "x" * 1001}, {}])
def test_invalid_escalation_is_422(client, api, jane, ticket, body) -> None:
    url = f"{api}/tickets/{ticket['ticket_id']}/escalation"
    assert client.post(url, json=body, headers=jane).status_code == 422


def test_escalating_someone_elses_ticket_is_404(client, api, eve, ticket, run_sql) -> None:
    response = client.post(
        f"{api}/tickets/{ticket['ticket_id']}/escalation", json={"reason": "x"}, headers=eve
    )
    assert response.status_code == 404
    escalated = run_sql("SELECT escalation_requested FROM tickets WHERE ticket_id = %s", (ticket["ticket_id"],))
    assert escalated[0]["escalation_requested"] is False


@pytest.mark.parametrize("action", ["notes", "escalation"])
def test_actions_require_a_signed_in_user(client, api, ticket, action) -> None:
    body = {"note_text": "x"} if action == "notes" else {"reason": "x"}
    assert client.post(f"{api}/tickets/{ticket['ticket_id']}/{action}", json=body).status_code == 401
