"""The status history of the caller's tickets: every status a ticket has been in."""

from pathlib import Path

import psycopg
import pytest

import db

SCHEMA_SQL = Path(__file__).resolve().parent.parent / "sql" / "schema.sql"


@pytest.fixture
def ticket(create_ticket, jane) -> dict:
    """An open ticket owned by Jane."""
    return create_ticket(jane)


@pytest.fixture
def engineer(user_with_role) -> dict:
    """An engineer to make status changes. The API can't change status yet, so tests use SQL."""
    return user_with_role("engineer")


def _record(run_sql, ticket_id: int, changes: list[tuple], user_id: int) -> None:
    """Write (from_status, to_status, reason) rows in one transaction, so they share a timestamp."""
    values = ", ".join(["(%s, %s, %s, %s, %s)"] * len(changes))
    params = [p for f, t, r in changes for p in (ticket_id, f, t, user_id, r)]
    run_sql(
        "INSERT INTO ticket_status_history "
        f"(ticket_id, from_status, to_status, changed_by_user_id, reason) VALUES {values}",
        tuple(params),
    )


def test_creating_a_ticket_records_it_as_opened(client, api, jane, jane_user, ticket) -> None:
    history = client.get(f"{api}/tickets/{ticket['ticket_id']}/history", headers=jane)

    assert history.status_code == 200
    [row] = history.json()
    assert (row["from_status"], row["to_status"]) == (None, "open")
    assert (row["changed_by_user_id"], row["changed_by_name"], row["changed_by_role"]) == (
        jane_user["user_id"], "Jane Doe", "employee"
    )
    assert row["reason"] is None
    assert row["changed_at"] == ticket["created_at"]


def test_a_reopened_ticket_keeps_every_step_in_order(
    client, api, jane, ticket, engineer, run_sql
) -> None:
    _record(
        run_sql,
        ticket["ticket_id"],
        [
            ("open", "in_progress", None),
            ("in_progress", "blocked", "Waiting for a replacement part"),
            ("blocked", "in_progress", None),
            ("in_progress", "resolved", None),
            ("resolved", "open", "Wi-Fi dropped again"),
        ],
        engineer["user_id"],
    )

    rows = client.get(f"{api}/tickets/{ticket['ticket_id']}/history", headers=jane).json()

    # All five share one changed_at, so this also checks the history_id tie-break.
    assert [(r["from_status"], r["to_status"], r["reason"]) for r in rows] == [
        (None, "open", None),
        ("open", "in_progress", None),
        ("in_progress", "blocked", "Waiting for a replacement part"),
        ("blocked", "in_progress", None),
        ("in_progress", "resolved", None),
        ("resolved", "open", "Wi-Fi dropped again"),
    ]
    assert {r["changed_by_role"] for r in rows[1:]} == {"engineer"}


def test_history_never_includes_priority(client, api, jane, ticket) -> None:
    rows = client.get(f"{api}/tickets/{ticket['ticket_id']}/history", headers=jane).json()
    assert all("priority" not in row for row in rows)


def test_history_of_someone_elses_ticket_is_404(client, api, eve, ticket) -> None:
    response = client.get(f"{api}/tickets/{ticket['ticket_id']}/history", headers=eve)
    assert response.status_code == 404
    assert response.json() == {"detail": "Ticket not found"}


def test_history_of_a_missing_ticket_is_404(client, api, jane) -> None:
    assert client.get(f"{api}/tickets/999/history", headers=jane).status_code == 404


def test_history_requires_a_signed_in_user(client, api, ticket) -> None:
    assert client.get(f"{api}/tickets/{ticket['ticket_id']}/history").status_code == 401


def test_deleting_a_ticket_deletes_its_history(ticket, run_sql) -> None:
    run_sql("DELETE FROM tickets WHERE ticket_id = %s", (ticket["ticket_id"],))
    assert run_sql("SELECT count(*) AS n FROM ticket_status_history")[0]["n"] == 0


@pytest.mark.parametrize(
    ("from_status", "to_status"),
    [("open", "open"), ("open", "reopened"), ("pending", "open"), ("open", None)],
)
def test_the_database_rejects_invalid_changes(
    ticket, jane_user, run_sql, from_status, to_status
) -> None:
    with pytest.raises(psycopg.errors.CheckViolation if to_status else psycopg.errors.NotNullViolation):
        _record(run_sql, ticket["ticket_id"], [(from_status, to_status, None)], jane_user["user_id"])


def test_schema_backfills_tickets_created_before_history_existed(ticket, run_sql) -> None:
    run_sql("DELETE FROM ticket_status_history")

    # Run schema.sql twice: the first run backfills, the second must not add duplicates.
    for _ in range(2):
        with db.transaction() as conn:
            conn.execute(SCHEMA_SQL.read_text())

    rows = run_sql("SELECT from_status, to_status, changed_by_user_id, changed_at FROM ticket_status_history")
    created = run_sql(
        "SELECT created_by_user_id, created_at FROM tickets WHERE ticket_id = %s", (ticket["ticket_id"],)
    )[0]
    assert rows == [
        {
            "from_status": None,
            "to_status": "open",
            "changed_by_user_id": created["created_by_user_id"],
            "changed_at": created["created_at"],
        }
    ]
