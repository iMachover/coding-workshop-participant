"""Location lookups for the building -> floor -> seat dropdowns."""

from typing import Any

import db
from errors import NotFoundError
from repositories import location_repository


def list_buildings() -> list[dict[str, Any]]:
    """Return every building."""
    with db.transaction() as conn:
        return location_repository.list_buildings(conn)


def list_floors(building_id: int) -> list[dict[str, Any]]:
    """Return a building's floors. Raises NotFoundError if the building doesn't exist."""
    with db.transaction() as conn:
        if location_repository.get_building(conn, building_id) is None:
            raise NotFoundError("Building not found")
        return location_repository.list_floors(conn, building_id)


def list_seats(floor_id: int) -> list[dict[str, Any]]:
    """Return a floor's seats. Raises NotFoundError if the floor doesn't exist."""
    with db.transaction() as conn:
        if location_repository.get_floor(conn, floor_id) is None:
            raise NotFoundError("Floor not found")
        return location_repository.list_seats(conn, floor_id)
