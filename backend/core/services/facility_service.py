"""Facility Admins managing buildings, floors and seats.

Admins add, rename and (de)activate locations at every level. Deactivating never touches
tickets: they keep their location, and it's only hidden from new tickets (see
location_service and ticket_service). Delete is only for a location nothing has ever
used (no tickets, closed ones included, and no floors or seats under it), such as a
typo; otherwise it's 409 and the admin deactivates it instead.

Every write locks the row it changes (or the parent it adds to) first, so a ticket or
child can't start pointing at a location while it's being deleted.
"""

from typing import Any

import db
from errors import ConflictError, NotFoundError
from repositories import facility_repository as repo

BUILDING_NOT_FOUND = "Building not found"
FLOOR_NOT_FOUND = "Floor not found"
SEAT_NOT_FOUND = "Seat not found"


def _plural(count: int, word: str) -> str:
    """'1 ticket', '3 tickets'."""
    return f"{count} {word}" if count == 1 else f"{count} {word}s"


def get_tree() -> list[dict[str, Any]]:
    """Return every building with its floors, and each floor with its seats, inactive ones included."""
    with db.transaction() as conn:
        buildings = repo.list_buildings(conn)
        floors = repo.list_floors(conn)
        seats = repo.list_seats(conn)

    seats_by_floor: dict[int, list[dict[str, Any]]] = {}
    for seat in seats:
        seats_by_floor.setdefault(seat["floor_id"], []).append(seat)
    floors_by_building: dict[int, list[dict[str, Any]]] = {}
    for floor in floors:
        floor["seats"] = seats_by_floor.get(floor["floor_id"], [])
        floors_by_building.setdefault(floor["building_id"], []).append(floor)
    for building in buildings:
        building["floors"] = floors_by_building.get(building["building_id"], [])
    return buildings


# --- buildings ------------------------------------------------------------------------


def create_building(building_name: str) -> dict[str, Any]:
    """Add an active building. A name already used (ignoring case) is a 409."""
    with db.transaction() as conn:
        building_id = repo.insert_building(conn, building_name)
        if building_id is None:
            raise ConflictError(f"There's already a building called {building_name}")
        return repo.list_buildings(conn, building_id)[0]


def update_building(building_id: int, building_name: str | None, is_active: bool | None) -> dict[str, Any]:
    """Rename and/or (de)activate a building. 404 if it doesn't exist, 409 for a name already used."""
    with db.transaction() as conn:
        if repo.lock_building(conn, building_id) is None:
            raise NotFoundError(BUILDING_NOT_FOUND)
        if not repo.update_building(conn, building_id, building_name, is_active):
            raise ConflictError(f"There's already a building called {building_name}")
        return repo.list_buildings(conn, building_id)[0]


def delete_building(building_id: int) -> None:
    """Delete a building nothing uses. 404 if it doesn't exist; 409 if it has tickets or floors."""
    with db.transaction() as conn:
        building = repo.lock_building(conn, building_id)
        if building is None:
            raise NotFoundError(BUILDING_NOT_FOUND)
        name = building["building_name"]
        tickets = repo.count_tickets(conn, "building_id", building_id)
        if tickets:
            raise ConflictError(
                f"{name} has {_plural(tickets, 'ticket')}, so it can't be deleted. Deactivate it instead."
            )
        floors = repo.count_floors(conn, building_id)
        if floors:
            raise ConflictError(
                f"{name} still has {_plural(floors, 'floor')}. Delete them first, or deactivate it instead."
            )
        repo.delete_building(conn, building_id)


# --- floors ---------------------------------------------------------------------------


def create_floor(building_id: int, floor_number: int) -> dict[str, Any]:
    """Add an active floor to a building (even an inactive one). 404 for no building, 409 for a number in use."""
    with db.transaction() as conn:
        building = repo.lock_building(conn, building_id)
        if building is None:
            raise NotFoundError(BUILDING_NOT_FOUND)
        floor_id = repo.insert_floor(conn, building_id, floor_number)
        if floor_id is None:
            raise ConflictError(f"{building['building_name']} already has floor {floor_number}")
        return repo.list_floors(conn, floor_id)[0]


def update_floor(floor_id: int, floor_number: int | None, is_active: bool | None) -> dict[str, Any]:
    """Renumber and/or (de)activate a floor. 404 if it doesn't exist, 409 for a number in use."""
    with db.transaction() as conn:
        floor = repo.lock_floor(conn, floor_id)
        if floor is None:
            raise NotFoundError(FLOOR_NOT_FOUND)
        if not repo.update_floor(conn, floor_id, floor_number, is_active):
            raise ConflictError(f"{floor['building_name']} already has floor {floor_number}")
        return repo.list_floors(conn, floor_id)[0]


def delete_floor(floor_id: int) -> None:
    """Delete a floor nothing uses. 404 if it doesn't exist; 409 if it has tickets or seats."""
    with db.transaction() as conn:
        floor = repo.lock_floor(conn, floor_id)
        if floor is None:
            raise NotFoundError(FLOOR_NOT_FOUND)
        name = f"Floor {floor['floor_number']}"
        tickets = repo.count_tickets(conn, "floor_id", floor_id)
        if tickets:
            raise ConflictError(
                f"{name} has {_plural(tickets, 'ticket')}, so it can't be deleted. Deactivate it instead."
            )
        seats = repo.count_seats(conn, floor_id)
        if seats:
            raise ConflictError(
                f"{name} still has {_plural(seats, 'seat')}. Delete them first, or deactivate it instead."
            )
        repo.delete_floor(conn, floor_id)


# --- seats ----------------------------------------------------------------------------


def create_seat(floor_id: int, seat_number: str) -> dict[str, Any]:
    """Add an active seat to a floor (even an inactive one). 404 for no floor, 409 for a number in use."""
    with db.transaction() as conn:
        floor = repo.lock_floor(conn, floor_id)
        if floor is None:
            raise NotFoundError(FLOOR_NOT_FOUND)
        seat_id = repo.insert_seat(conn, floor_id, seat_number)
        if seat_id is None:
            raise ConflictError(f"Floor {floor['floor_number']} already has seat {seat_number}")
        return repo.list_seats(conn, seat_id)[0]


def update_seat(seat_id: int, seat_number: str | None, is_active: bool | None) -> dict[str, Any]:
    """Renumber and/or (de)activate a seat. 404 if it doesn't exist, 409 for a number in use."""
    with db.transaction() as conn:
        seat = repo.lock_seat(conn, seat_id)
        if seat is None:
            raise NotFoundError(SEAT_NOT_FOUND)
        if not repo.update_seat(conn, seat_id, seat_number, is_active):
            raise ConflictError(f"Floor {seat['floor_number']} already has seat {seat_number}")
        return repo.list_seats(conn, seat_id)[0]


def delete_seat(seat_id: int) -> None:
    """Delete a seat no ticket has used. 404 if it doesn't exist; 409 if it has tickets."""
    with db.transaction() as conn:
        seat = repo.lock_seat(conn, seat_id)
        if seat is None:
            raise NotFoundError(SEAT_NOT_FOUND)
        tickets = repo.count_tickets(conn, "seat_id", seat_id)
        if tickets:
            raise ConflictError(
                f"Seat {seat['seat_number']} has {_plural(tickets, 'ticket')}, so it can't be deleted. "
                "Deactivate it instead."
            )
        repo.delete_seat(conn, seat_id)
