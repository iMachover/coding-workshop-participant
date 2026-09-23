"""Creating, listing and viewing the caller's tickets."""

import pytest


# --- create -------------------------------------------------------------------


@pytest.mark.parametrize(
    ("scope", "location", "priority"),
    [
        ("me", {}, "P3"),
        ("floor", {"seat_id": None}, "P2"),
        ("building", {"floor_id": None, "seat_id": None}, "P1"),
    ],
)
def test_create_sets_priority_from_scope(create_ticket, jane, scope, location, priority) -> None:
    ticket = create_ticket(jane, affected_scope=scope, **location)
    assert ticket["priority"] == priority
    assert ticket["status"] == "open"
    assert ticket["created_by_user_id"] == int(jane["X-User-Id"])
    assert ticket["escalation_requested"] is False
    assert ticket["assigned_to_user_id"] is None


def test_create_ignores_server_owned_fields(create_ticket, jane, eve) -> None:
    ticket = create_ticket(
        jane,
        affected_scope="building",
        floor_id=None,
        seat_id=None,
        status="closed",
        priority="P3",
        created_by_user_id=int(eve["X-User-Id"]),
    )
    assert (ticket["status"], ticket["priority"]) == ("open", "P1")
    assert ticket["created_by_user_id"] == int(jane["X-User-Id"])


@pytest.mark.parametrize(
    ("overrides", "detail"),
    [
        ({"floor_id": "A1"}, "Seat {A301} is not on floor {A1}"),
        ({"building_id": "B"}, "Floor {A3} is not in building {B}"),
        ({"building_id": 999}, "Building 999 does not exist"),
        ({"floor_id": 999}, "Floor 999 does not exist"),
        ({"seat_id": 999}, "Seat 999 does not exist"),
    ],
)
def test_create_checks_the_location_hierarchy(
    client, api, jane, loc, ticket_payload, overrides, detail
) -> None:
    # Values like "A1" are names from the loc fixture; numbers are used as-is.
    resolved = {k: loc[v] if isinstance(v, str) else v for k, v in overrides.items()}
    response = client.post(f"{api}/tickets", json=ticket_payload(**resolved), headers=jane)
    assert response.status_code == 400
    assert response.json() == {"detail": detail.format(**loc)}


@pytest.mark.parametrize(
    "overrides",
    [
        {"seat_id": None},  # scope "me" without a seat
        {"affected_scope": "floor", "floor_id": None, "seat_id": None},
        {"category": "plumbing"},
        {"urgency": "urgent"},
        {"title": "   "},
        {"description": "x" * 5001},
    ],
)
def test_create_rejects_invalid_input(client, api, jane, ticket_payload, overrides) -> None:
    response = client.post(f"{api}/tickets", json=ticket_payload(**overrides), headers=jane)
    assert response.status_code == 422


def test_create_requires_a_signed_in_user(client, api, ticket_payload) -> None:
    assert client.post(f"{api}/tickets", json=ticket_payload()).status_code == 401


# --- list ---------------------------------------------------------------------


def _ids(client, api, headers, **params) -> list[int]:
    response = client.get(f"{api}/tickets", headers=headers, params=params)
    assert response.status_code == 200, response.text
    return [t["ticket_id"] for t in response.json()]


def test_list_shows_only_the_callers_tickets(client, api, jane, eve, create_ticket) -> None:
    mine = create_ticket(jane)
    create_ticket(eve)
    assert _ids(client, api, jane) == [mine["ticket_id"]]


def test_list_includes_location_names(client, api, jane, create_ticket) -> None:
    create_ticket(jane)
    item = client.get(f"{api}/tickets", headers=jane).json()[0]
    assert (item["building_name"], item["floor_number"], item["seat_number"]) == (
        "Building A", 3, "301",
    )


def test_list_is_most_recently_updated_first(client, api, jane, create_ticket, run_sql) -> None:
    older = create_ticket(jane)["ticket_id"]
    newer = create_ticket(jane)["ticket_id"]
    assert _ids(client, api, jane) == [newer, older]
    run_sql("UPDATE tickets SET updated_at = now() + interval '1 minute' WHERE ticket_id = %s", (older,))
    assert _ids(client, api, jane) == [older, newer]


@pytest.fixture
def mixed_tickets(create_ticket, jane, run_sql) -> dict[str, int]:
    """Three tickets that differ in status, urgency, scope and text."""
    wifi = create_ticket(jane)["ticket_id"]
    printer = create_ticket(
        jane, title="Printer jam", short_description="Tray 2 is 100% stuck",
        category="printer", urgency="high", affected_scope="floor", seat_id=None,
    )["ticket_id"]
    lamp = create_ticket(
        jane, title="Lamp_broken", short_description="Flickers", urgency="low",
        affected_scope="building", floor_id=None, seat_id=None,
    )["ticket_id"]
    run_sql("UPDATE tickets SET status = 'closed' WHERE ticket_id = %s", (lamp,))
    return {"wifi": wifi, "printer": printer, "lamp": lamp}


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({"view": "active"}, {"wifi", "printer"}),
        ({"view": "closed"}, {"lamp"}),
        ({"status": "open"}, {"wifi", "printer"}),
        ({"urgency": "high"}, {"printer"}),
        ({"priority": "P1"}, {"lamp"}),
        ({"q": "WI-FI"}, {"wifi"}),
        ({"q": "tray"}, {"printer"}),
        ({"q": "%"}, {"printer"}),
        ({"q": "_"}, {"lamp"}),
        ({"q": "nothing matches"}, set()),
        ({"view": "active", "urgency": "medium"}, {"wifi"}),
        ({"view": "closed", "status": "open"}, set()),
    ],
)
def test_list_filters(client, api, jane, mixed_tickets, params, expected) -> None:
    by_id = {v: k for k, v in mixed_tickets.items()}
    assert {by_id[i] for i in _ids(client, api, jane, **params)} == expected


def test_list_search_matches_ticket_id(client, api, jane, mixed_tickets) -> None:
    assert _ids(client, api, jane, q=str(mixed_tickets["printer"])) == [mixed_tickets["printer"]]


@pytest.mark.parametrize("params", [{"status": "bogus"}, {"view": "all"}, {"q": "x" * 101}])
def test_list_rejects_unknown_filter_values(client, api, jane, params) -> None:
    assert client.get(f"{api}/tickets", headers=jane, params=params).status_code == 422


# --- details ------------------------------------------------------------------


def test_details_include_names_and_assigned_engineer(
    client, api, jane, register, create_ticket, run_sql
) -> None:
    ticket = create_ticket(jane)
    sam = register("sam@acme.inc", "Sam Tech")
    run_sql(
        "UPDATE tickets SET assigned_to_user_id = %s, status = 'in_progress' WHERE ticket_id = %s",
        (sam["user_id"], ticket["ticket_id"]),
    )

    response = client.get(f"{api}/tickets/{ticket['ticket_id']}", headers=jane)

    assert response.status_code == 200
    detail = response.json()
    assert detail["description"] == ticket["description"]
    assert detail["assigned_to_name"] == "Sam Tech"
    assert detail["status"] == "in_progress"
    assert (detail["building_name"], detail["floor_number"], detail["seat_number"]) == (
        "Building A", 3, "301",
    )


def test_details_of_unassigned_building_ticket(client, api, jane, create_ticket) -> None:
    ticket = create_ticket(jane, affected_scope="building", floor_id=None, seat_id=None)
    detail = client.get(f"{api}/tickets/{ticket['ticket_id']}", headers=jane).json()
    assert detail["assigned_to_name"] is None
    assert detail["floor_number"] is None and detail["seat_number"] is None


def test_someone_elses_ticket_looks_like_a_missing_one(client, api, jane, eve, create_ticket) -> None:
    ticket = create_ticket(jane)
    others = client.get(f"{api}/tickets/{ticket['ticket_id']}", headers=eve)
    missing = client.get(f"{api}/tickets/999", headers=jane)
    assert others.status_code == missing.status_code == 404
    assert others.json() == missing.json() == {"detail": "Ticket not found"}
