"""SQL for the buildings, floors and seats tables, as employees see them.

The lists only return active locations, for the create-ticket dropdowns. The single
lookups return any location with its is_active flag, so callers can tell "doesn't
exist" from "no longer available". Admin changes live in facility_repository.
"""

from typing import Any

import psycopg


def list_buildings(conn: psycopg.Connection) -> list[dict[str, Any]]:
    """Return the active buildings, alphabetically."""
    return conn.execute(
        "SELECT building_id, building_name FROM buildings WHERE is_active ORDER BY building_name"
    ).fetchall()


def get_building(conn: psycopg.Connection, building_id: int) -> dict[str, Any] | None:
    """Return one building, active or not, or None."""
    return conn.execute(
        "SELECT building_id, building_name, is_active FROM buildings WHERE building_id = %s",
        (building_id,),
    ).fetchone()


def list_floors(conn: psycopg.Connection, building_id: int) -> list[dict[str, Any]]:
    """Return a building's active floors, lowest first."""
    return conn.execute(
        """
        SELECT floor_id, floor_number, building_id
        FROM floors
        WHERE building_id = %s AND is_active
        ORDER BY floor_number
        """,
        (building_id,),
    ).fetchall()


def get_floor(conn: psycopg.Connection, floor_id: int) -> dict[str, Any] | None:
    """Return one floor, active or not, or None."""
    return conn.execute(
        "SELECT floor_id, floor_number, building_id, is_active FROM floors WHERE floor_id = %s",
        (floor_id,),
    ).fetchone()


def get_seat(conn: psycopg.Connection, seat_id: int) -> dict[str, Any] | None:
    """Return one seat, active or not, or None."""
    return conn.execute(
        "SELECT seat_id, seat_number, floor_id, is_active FROM seats WHERE seat_id = %s",
        (seat_id,),
    ).fetchone()


def list_seats(conn: psycopg.Connection, floor_id: int) -> list[dict[str, Any]]:
    """Return a floor's active seats, ordered by seat number."""
    return conn.execute(
        """
        SELECT seat_id, seat_number, floor_id
        FROM seats
        WHERE floor_id = %s AND is_active
        ORDER BY seat_number
        """,
        (floor_id,),
    ).fetchall()
