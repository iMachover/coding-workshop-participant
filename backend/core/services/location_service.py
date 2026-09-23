"""Location lookups for the building -> floor -> seat dropdowns.

Only active locations are offered. A building or floor that's been deactivated (or sits
in an inactive building) answers 404, the same as one that doesn't exist.
"""

from typing import Any

import db
from errors import NotFoundError
from repositories import location_repository


def list_buildings() -> list[dict[str, Any]]:
    """Return every active building."""
    with db.transaction() as conn:
        return location_repository.list_buildings(conn)


def list_floors(building_id: int) -> list[dict[str, Any]]:
    """Return an active building's active floors. Raises NotFoundError otherwise."""
    with db.transaction() as conn:
        building = location_repository.get_building(conn, building_id)
        if building is None or not building["is_active"]:
            raise NotFoundError("Building not found")
        return location_repository.list_floors(conn, building_id)


def list_seats(floor_id: int) -> list[dict[str, Any]]:
    """Return an active floor's active seats. Raises NotFoundError otherwise, or if its building is inactive."""
    with db.transaction() as conn:
        floor = location_repository.get_floor(conn, floor_id)
        if floor is None or not floor["is_active"]:
            raise NotFoundError("Floor not found")
        if not location_repository.get_building(conn, floor["building_id"])["is_active"]:
            raise NotFoundError("Floor not found")
        return location_repository.list_seats(conn, floor_id)
