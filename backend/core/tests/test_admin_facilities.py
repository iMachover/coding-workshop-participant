"""Facility Admins managing buildings, floors and seats, and what employees see afterwards."""

from pathlib import Path

import pytest

import db

SCHEMA_SQL = Path(__file__).resolve().parent.parent / "sql" / "schema.sql"


def _tree(client, api, admin) -> list[dict]:
    response = client.get(f"{api}/admin/facilities", headers=admin)
    assert response.status_code == 200, response.text
    return response.json()


def _find(items: list[dict], key: str, value) -> dict:
    return next(item for item in items if item[key] == value)


def _patch(client, api, admin, path, **body):
    return client.patch(f"{api}/admin/{path}", json=body, headers=admin)


def _close(run_sql, ticket_id) -> None:
    run_sql("UPDATE tickets SET status = 'closed' WHERE ticket_id = %s", (ticket_id,))


# --- the tree -----------------------------------------------------------------------


def test_tree_lists_every_location_in_order_with_active_ticket_counts(
    client, api, admin, jane, create_ticket, run_sql, loc
) -> None:
    create_ticket(jane)  # A / 3 / 301
    create_ticket(jane, affected_scope="floor", floor_id=loc["A3"], seat_id=None)
    create_ticket(jane, affected_scope="building", building_id=loc["B"], floor_id=None, seat_id=None)
    _close(run_sql, create_ticket(jane)["ticket_id"])  # closed tickets don't count

    tree = _tree(client, api, admin)

    assert [b["building_name"] for b in tree] == ["Building A", "Building B"]
    building_a, building_b = tree
    assert [f["floor_number"] for f in building_a["floors"]] == [1, 2, 3]
    floor_3 = building_a["floors"][2]
    assert [s["seat_number"] for s in floor_3["seats"]] == ["301", "302", "303", "304"]
    assert (building_a["active_ticket_count"], building_b["active_ticket_count"]) == (2, 1)
    assert (floor_3["active_ticket_count"], building_a["floors"][0]["active_ticket_count"]) == (2, 0)
    assert [s["active_ticket_count"] for s in floor_3["seats"]] == [1, 0, 0, 0]
    assert set(building_a) == {"building_id", "building_name", "is_active", "active_ticket_count", "floors"}
    assert set(floor_3) == {
        "floor_id", "floor_number", "building_id", "is_active", "active_ticket_count", "seats",
    }
    assert set(floor_3["seats"][0]) == {
        "seat_id", "seat_number", "floor_id", "is_active", "active_ticket_count",
    }
    assert all(b["is_active"] for b in tree)


def test_tree_keeps_inactive_locations_with_their_flag(client, api, admin, loc) -> None:
    _patch(client, api, admin, f"buildings/{loc['B']}", is_active=False)
    _patch(client, api, admin, f"seats/{loc['A301']}", is_active=False)

    building_a, building_b = _tree(client, api, admin)

    assert building_b["is_active"] is False
    assert [f["floor_number"] for f in building_b["floors"]] == [1, 2]
    seats = building_a["floors"][2]["seats"]
    assert [(s["seat_number"], s["is_active"]) for s in seats][:2] == [("301", False), ("302", True)]


# --- adding -------------------------------------------------------------------------


def test_add_a_building_floor_and_seat_that_employees_can_then_pick(client, api, admin, jane) -> None:
    response = client.post(f"{api}/admin/buildings", json={"building_name": "  Annex "}, headers=admin)
    assert response.status_code == 201, response.text
    building = response.json()
    assert building == {
        "building_id": building["building_id"],
        "building_name": "Annex",
        "is_active": True,
        "active_ticket_count": 0,
    }

    response = client.post(
        f"{api}/admin/buildings/{building['building_id']}/floors", json={"floor_number": -1}, headers=admin
    )
    assert response.status_code == 201, response.text
    floor = response.json()
    assert (floor["floor_number"], floor["building_id"], floor["is_active"]) == (-1, building["building_id"], True)

    response = client.post(
        f"{api}/admin/floors/{floor['floor_id']}/seats", json={"seat_number": "B-12"}, headers=admin
    )
    assert response.status_code == 201, response.text
    seat = response.json()
    assert (seat["seat_number"], seat["floor_id"], seat["active_ticket_count"]) == ("B-12", floor["floor_id"], 0)

    names = [b["building_name"] for b in client.get(f"{api}/buildings", headers=jane).json()]
    assert names == ["Annex", "Building A", "Building B"]
    floors = client.get(f"{api}/buildings/{building['building_id']}/floors", headers=jane).json()
    assert [f["floor_number"] for f in floors] == [-1]
    seats = client.get(f"{api}/floors/{floor['floor_id']}/seats", headers=jane).json()
    assert [s["seat_number"] for s in seats] == ["B-12"]


@pytest.mark.parametrize(
    ("path", "body", "detail"),
    [
        ("buildings", {"building_name": "building a"}, "There's already a building called building a"),
        ("buildings/{A}/floors", {"floor_number": 3}, "Building A already has floor 3"),
        ("floors/{A3}/seats", {"seat_number": "301"}, "Floor 3 already has seat 301"),
    ],
)
def test_adding_a_duplicate_is_409(client, api, admin, loc, path, body, detail) -> None:
    response = client.post(f"{api}/admin/{path.format(**loc)}", json=body, headers=admin)
    assert response.status_code == 409
    assert response.json() == {"detail": detail}


def test_seat_numbers_are_unique_on_a_floor_ignoring_case_but_can_repeat_on_another(
    client, api, admin, loc
) -> None:
    assert client.post(f"{api}/admin/floors/{loc['A3']}/seats", json={"seat_number": "12a"}, headers=admin).status_code == 201
    assert client.post(f"{api}/admin/floors/{loc['A3']}/seats", json={"seat_number": "12A"}, headers=admin).status_code == 409
    assert client.post(f"{api}/admin/floors/{loc['A2']}/seats", json={"seat_number": "12A"}, headers=admin).status_code == 201


def test_a_floor_can_be_added_to_an_inactive_building(client, api, admin, loc) -> None:
    _patch(client, api, admin, f"buildings/{loc['B']}", is_active=False)
    response = client.post(f"{api}/admin/buildings/{loc['B']}/floors", json={"floor_number": 3}, headers=admin)
    assert response.status_code == 201


@pytest.mark.parametrize(
    ("path", "body", "detail"),
    [
        ("buildings/999/floors", {"floor_number": 1}, "Building not found"),
        ("floors/999/seats", {"seat_number": "1"}, "Floor not found"),
    ],
)
def test_adding_under_a_missing_parent_is_404(client, api, admin, path, body, detail) -> None:
    response = client.post(f"{api}/admin/{path}", json=body, headers=admin)
    assert response.status_code == 404
    assert response.json() == {"detail": detail}


@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("buildings", {}),
        ("buildings", {"building_name": "   "}),
        ("buildings", {"building_name": "x" * 101}),
        ("buildings", {"building_name": "Annex", "is_active": False}),
        ("buildings/{A}/floors", {"floor_number": -11}),
        ("buildings/{A}/floors", {"floor_number": 201}),
        ("buildings/{A}/floors", {"floor_number": "first"}),
        ("buildings/{A}/floors", {}),
        ("floors/{A3}/seats", {"seat_number": ""}),
        ("floors/{A3}/seats", {"seat_number": "x" * 21}),
        ("floors/{A3}/seats", {"seat_number": None}),
    ],
)
def test_bad_new_locations_are_422(client, api, admin, loc, path, body) -> None:
    response = client.post(f"{api}/admin/{path.format(**loc)}", json=body, headers=admin)
    assert response.status_code == 422


# --- renaming -------------------------------------------------------------------------


def test_rename_each_level(client, api, admin, loc) -> None:
    response = _patch(client, api, admin, f"buildings/{loc['A']}", building_name="HQ")
    assert response.status_code == 200
    assert response.json() == {
        "building_id": loc["A"], "building_name": "HQ", "is_active": True, "active_ticket_count": 0,
    }

    response = _patch(client, api, admin, f"floors/{loc['A3']}", floor_number=30)
    assert (response.status_code, response.json()["floor_number"]) == (200, 30)

    response = _patch(client, api, admin, f"seats/{loc['A301']}", seat_number="30-01")
    assert (response.status_code, response.json()["seat_number"]) == (200, "30-01")

    building = _find(_tree(client, api, admin), "building_id", loc["A"])
    assert building["building_name"] == "HQ"
    assert building["floors"][-1]["floor_number"] == 30
    assert building["floors"][-1]["seats"][0]["seat_number"] == "30-01"


def test_a_building_can_change_the_case_of_its_own_name(client, api, admin, loc) -> None:
    response = _patch(client, api, admin, f"buildings/{loc['A']}", building_name="BUILDING A")
    assert (response.status_code, response.json()["building_name"]) == (200, "BUILDING A")


@pytest.mark.parametrize(
    ("path", "body", "detail"),
    [
        ("buildings/{A}", {"building_name": "Building b"}, "There's already a building called Building b"),
        ("floors/{A3}", {"floor_number": 1}, "Building A already has floor 1"),
        ("seats/{A301}", {"seat_number": "302"}, "Floor 3 already has seat 302"),
    ],
)
def test_renaming_to_a_name_in_use_is_409_and_changes_nothing(client, api, admin, loc, path, body, detail) -> None:
    before = _tree(client, api, admin)
    response = client.patch(f"{api}/admin/{path.format(**loc)}", json=body, headers=admin)
    assert response.status_code == 409
    assert response.json() == {"detail": detail}
    assert _tree(client, api, admin) == before


def test_rename_and_deactivate_together(client, api, admin, loc) -> None:
    response = _patch(client, api, admin, f"buildings/{loc['B']}", building_name="Old B", is_active=False)
    assert response.status_code == 200
    assert (response.json()["building_name"], response.json()["is_active"]) == ("Old B", False)


@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("buildings/{A}", {}),
        ("buildings/{A}", {"building_name": None}),
        ("buildings/{A}", {"building_name": "  "}),
        ("buildings/{A}", {"floor_number": 2}),
        ("floors/{A3}", {"floor_number": 500}),
        ("floors/{A3}", {"is_active": None}),
        ("seats/{A301}", {"seat_number": "x" * 21}),
        ("seats/{A301}", {"is_active": "maybe"}),
    ],
)
def test_bad_changes_are_422(client, api, admin, loc, path, body) -> None:
    response = client.patch(f"{api}/admin/{path.format(**loc)}", json=body, headers=admin)
    assert response.status_code == 422


# --- deactivating ---------------------------------------------------------------------


def test_an_inactive_building_hides_it_and_everything_in_it_from_employees(client, api, admin, jane, loc) -> None:
    assert _patch(client, api, admin, f"buildings/{loc['B']}", is_active=False).status_code == 200

    names = [b["building_name"] for b in client.get(f"{api}/buildings", headers=jane).json()]
    assert names == ["Building A"]
    assert client.get(f"{api}/buildings/{loc['B']}/floors", headers=jane).status_code == 404
    response = client.get(f"{api}/floors/{loc['B1']}/seats", headers=jane)
    assert (response.status_code, response.json()) == (404, {"detail": "Floor not found"})


def test_an_inactive_floor_or_seat_is_hidden_from_employees(client, api, admin, jane, loc) -> None:
    _patch(client, api, admin, f"floors/{loc['A2']}", is_active=False)
    _patch(client, api, admin, f"seats/{loc['A302']}", is_active=False)

    floors = client.get(f"{api}/buildings/{loc['A']}/floors", headers=jane).json()
    assert [f["floor_number"] for f in floors] == [1, 3]
    assert client.get(f"{api}/floors/{loc['A2']}/seats", headers=jane).status_code == 404
    seats = client.get(f"{api}/floors/{loc['A3']}/seats", headers=jane).json()
    assert [s["seat_number"] for s in seats] == ["301", "303", "304"]


def test_reactivating_brings_it_back(client, api, admin, jane, loc) -> None:
    _patch(client, api, admin, f"floors/{loc['A2']}", is_active=False)
    response = _patch(client, api, admin, f"floors/{loc['A2']}", is_active=True)
    assert (response.status_code, response.json()["is_active"]) == (200, True)

    floors = client.get(f"{api}/buildings/{loc['A']}/floors", headers=jane).json()
    assert [f["floor_number"] for f in floors] == [1, 2, 3]


def test_an_active_floor_stays_hidden_while_its_building_is_inactive(client, api, admin, jane, loc) -> None:
    _patch(client, api, admin, f"buildings/{loc['B']}", is_active=False)
    _patch(client, api, admin, f"floors/{loc['B1']}", is_active=False)
    assert _patch(client, api, admin, f"floors/{loc['B1']}", is_active=True).status_code == 200

    assert client.get(f"{api}/floors/{loc['B1']}/seats", headers=jane).status_code == 404
    _patch(client, api, admin, f"buildings/{loc['B']}", is_active=True)
    assert client.get(f"{api}/floors/{loc['B1']}/seats", headers=jane).status_code == 200


def test_deactivating_twice_is_harmless(client, api, admin, loc) -> None:
    _patch(client, api, admin, f"seats/{loc['A301']}", is_active=False)
    response = _patch(client, api, admin, f"seats/{loc['A301']}", is_active=False)
    assert (response.status_code, response.json()["is_active"]) == (200, False)


@pytest.mark.parametrize(
    ("path", "overrides", "detail"),
    [
        ("buildings/{A}", {}, "Building A is no longer available"),
        ("floors/{A3}", {}, "Floor 3 is no longer available"),
        ("seats/{A301}", {}, "Seat 301 is no longer available"),
        ("buildings/{B}", {"building_id": "B", "floor_id": "B1", "seat_id": "B101"}, "Building B is no longer available"),
        ("floors/{A2}", {"floor_id": "A2", "seat_id": "A201"}, "Floor 2 is no longer available"),
    ],
)
def test_new_tickets_cant_use_an_inactive_location(
    client, api, admin, jane, loc, ticket_payload, path, overrides, detail
) -> None:
    _patch(client, api, admin, path.format(**loc), is_active=False)
    body = ticket_payload(**{key: loc[name] for key, name in overrides.items()})

    response = client.post(f"{api}/tickets", json=body, headers=jane)

    assert response.status_code == 400
    assert response.json() == {"detail": detail}


def test_existing_tickets_keep_their_location_after_it_is_deactivated(
    client, api, admin, jane, loc, create_ticket
) -> None:
    ticket = create_ticket(jane)
    _patch(client, api, admin, f"buildings/{loc['A']}", is_active=False)

    details = client.get(f"{api}/tickets/{ticket['ticket_id']}", headers=jane).json()
    assert (details["building_name"], details["floor_number"], details["seat_number"]) == ("Building A", 3, "301")
    admin_details = client.get(f"{api}/admin/tickets/{ticket['ticket_id']}", headers=admin).json()
    assert admin_details["building_name"] == "Building A"
    assert _find(_tree(client, api, admin), "building_id", loc["A"])["active_ticket_count"] == 1


# --- deleting ---------------------------------------------------------------------------


def test_delete_locations_nothing_has_used(client, api, admin, loc) -> None:
    building = client.post(f"{api}/admin/buildings", json={"building_name": "Typo"}, headers=admin).json()
    floor = client.post(
        f"{api}/admin/buildings/{building['building_id']}/floors", json={"floor_number": 1}, headers=admin
    ).json()
    seat = client.post(f"{api}/admin/floors/{floor['floor_id']}/seats", json={"seat_number": "1"}, headers=admin).json()

    for path in (f"seats/{seat['seat_id']}", f"floors/{floor['floor_id']}", f"buildings/{building['building_id']}"):
        response = client.delete(f"{api}/admin/{path}", headers=admin)
        assert (response.status_code, response.content) == (204, b"")

    assert [b["building_name"] for b in _tree(client, api, admin)] == ["Building A", "Building B"]


def test_a_seeded_seat_nobody_used_can_be_deleted(client, api, admin, loc) -> None:
    assert client.delete(f"{api}/admin/seats/{loc['A304']}", headers=admin).status_code == 204
    seats = _find(_tree(client, api, admin), "building_id", loc["A"])["floors"][2]["seats"]
    assert [s["seat_number"] for s in seats] == ["301", "302", "303"]


@pytest.mark.parametrize(
    ("path", "detail"),
    [
        ("buildings/{A}", "Building A has 1 ticket, so it can't be deleted. Deactivate it instead."),
        ("floors/{A3}", "Floor 3 has 1 ticket, so it can't be deleted. Deactivate it instead."),
        ("seats/{A301}", "Seat 301 has 1 ticket, so it can't be deleted. Deactivate it instead."),
    ],
)
def test_a_location_any_ticket_used_cant_be_deleted_even_if_closed(
    client, api, admin, jane, loc, create_ticket, run_sql, path, detail
) -> None:
    _close(run_sql, create_ticket(jane)["ticket_id"])

    response = client.delete(f"{api}/admin/{path.format(**loc)}", headers=admin)

    assert response.status_code == 409
    assert response.json() == {"detail": detail}


@pytest.mark.parametrize(
    ("path", "detail"),
    [
        ("buildings/{B}", "Building B still has 2 floors. Delete them first, or deactivate it instead."),
        ("floors/{B1}", "Floor 1 still has 4 seats. Delete them first, or deactivate it instead."),
    ],
)
def test_a_building_or_floor_with_children_cant_be_deleted(client, api, admin, loc, path, detail) -> None:
    response = client.delete(f"{api}/admin/{path.format(**loc)}", headers=admin)
    assert response.status_code == 409
    assert response.json() == {"detail": detail}
    assert len(_tree(client, api, admin)) == 2


# --- missing and bad ids ----------------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "path", "body", "detail"),
    [
        ("PATCH", "buildings/999", {"is_active": False}, "Building not found"),
        ("PATCH", "floors/999", {"is_active": False}, "Floor not found"),
        ("PATCH", "seats/999", {"is_active": False}, "Seat not found"),
        ("DELETE", "buildings/999", None, "Building not found"),
        ("DELETE", "floors/999", None, "Floor not found"),
        ("DELETE", "seats/999", None, "Seat not found"),
    ],
)
def test_missing_locations_are_404(client, api, admin, method, path, body, detail) -> None:
    response = client.request(method, f"{api}/admin/{path}", json=body, headers=admin)
    assert response.status_code == 404
    assert response.json() == {"detail": detail}


@pytest.mark.parametrize("path", ["buildings/abc", "floors/0", "seats/99999999999999"])
def test_invalid_ids_are_422(client, api, admin, path) -> None:
    assert client.delete(f"{api}/admin/{path}", headers=admin).status_code == 422


# --- older databases ----------------------------------------------------------------------


def test_schema_adds_is_active_to_an_older_database(client, api, admin, jane, run_sql) -> None:
    with db.transaction() as conn:
        conn.execute(
            """
            DROP INDEX buildings_name_ci_key, seats_floor_number_ci_key;
            ALTER TABLE buildings DROP COLUMN is_active;
            ALTER TABLE floors DROP COLUMN is_active;
            ALTER TABLE seats DROP COLUMN is_active;
            """
        )

    # Run schema.sql twice: the first run adds the columns, the second must change nothing.
    for _ in range(2):
        with db.transaction() as conn:
            conn.execute(SCHEMA_SQL.read_text())

    rows = run_sql(
        "SELECT (SELECT bool_and(is_active) FROM buildings) AND (SELECT bool_and(is_active) FROM floors) "
        "AND (SELECT bool_and(is_active) FROM seats) AS all_active"
    )
    assert rows == [{"all_active": True}]
    assert len(client.get(f"{api}/buildings", headers=jane).json()) == 2
    duplicate = client.post(f"{api}/admin/buildings", json={"building_name": "BUILDING A"}, headers=admin)
    assert duplicate.status_code == 409
