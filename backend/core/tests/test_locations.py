"""Building, floor and seat lookups."""

import pytest


def test_list_buildings(client, api, jane) -> None:
    response = client.get(f"{api}/buildings", headers=jane)
    assert response.status_code == 200
    assert [b["building_name"] for b in response.json()] == ["Building A", "Building B"]


def test_list_floors_in_order(client, api, jane, loc) -> None:
    response = client.get(f"{api}/buildings/{loc['A']}/floors", headers=jane)
    assert response.status_code == 200
    assert [f["floor_number"] for f in response.json()] == [1, 2, 3]
    assert {f["building_id"] for f in response.json()} == {loc["A"]}


def test_list_seats(client, api, jane, loc) -> None:
    response = client.get(f"{api}/floors/{loc['A3']}/seats", headers=jane)
    assert response.status_code == 200
    assert [s["seat_number"] for s in response.json()] == ["301", "302", "303", "304"]


@pytest.mark.parametrize(
    ("path", "detail"),
    [("buildings/999/floors", "Building not found"), ("floors/999/seats", "Floor not found")],
)
def test_unknown_parent_is_404(client, api, jane, path, detail) -> None:
    response = client.get(f"{api}/{path}", headers=jane)
    assert response.status_code == 404
    assert response.json() == {"detail": detail}


@pytest.mark.parametrize("bad_id", ["abc", "0", "99999999999999"])
def test_invalid_ids_are_422(client, api, jane, bad_id) -> None:
    assert client.get(f"{api}/buildings/{bad_id}/floors", headers=jane).status_code == 422


@pytest.mark.parametrize("path", ["buildings", "buildings/1/floors", "floors/1/seats"])
def test_lookups_require_a_signed_in_user(client, api, path) -> None:
    assert client.get(f"{api}/{path}").status_code == 401
