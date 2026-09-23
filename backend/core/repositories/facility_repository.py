"""SQL for Facility Admins managing buildings, floors and seats, inactive ones included.

Every row carries is_active and active_ticket_count: tickets there that aren't closed,
the same "active" as the ticket list's view=active. A building counts every ticket in
it, whichever floor or seat. Duplicate names come back as None or False, never raised,
so the service can answer 409.
"""

from typing import Any

import psycopg

# Each list takes an optional id, so the same SQL builds the tree and returns one row
# after a change. ORDER BY matches the employee dropdowns.


def list_buildings(conn: psycopg.Connection, building_id: int | None = None) -> list[dict[str, Any]]:
    """Return every building (or just this one), alphabetically."""
    return conn.execute(
        """
        SELECT b.building_id, b.building_name, b.is_active,
               (SELECT count(*) FROM tickets t
                WHERE t.building_id = b.building_id AND t.status <> 'closed') AS active_ticket_count
        FROM buildings b
        WHERE (%(id)s::integer IS NULL OR b.building_id = %(id)s)
        ORDER BY b.building_name
        """,
        {"id": building_id},
    ).fetchall()


def list_floors(conn: psycopg.Connection, floor_id: int | None = None) -> list[dict[str, Any]]:
    """Return every floor (or just this one), by building then lowest first."""
    return conn.execute(
        """
        SELECT f.floor_id, f.floor_number, f.building_id, f.is_active,
               (SELECT count(*) FROM tickets t
                WHERE t.floor_id = f.floor_id AND t.status <> 'closed') AS active_ticket_count
        FROM floors f
        WHERE (%(id)s::integer IS NULL OR f.floor_id = %(id)s)
        ORDER BY f.building_id, f.floor_number
        """,
        {"id": floor_id},
    ).fetchall()


def list_seats(conn: psycopg.Connection, seat_id: int | None = None) -> list[dict[str, Any]]:
    """Return every seat (or just this one), by floor then seat number."""
    return conn.execute(
        """
        SELECT s.seat_id, s.seat_number, s.floor_id, s.is_active,
               (SELECT count(*) FROM tickets t
                WHERE t.seat_id = s.seat_id AND t.status <> 'closed') AS active_ticket_count
        FROM seats s
        WHERE (%(id)s::integer IS NULL OR s.seat_id = %(id)s)
        ORDER BY s.floor_id, s.seat_number
        """,
        {"id": seat_id},
    ).fetchall()


# --- locks ------------------------------------------------------------------------
# Locking a row blocks new tickets and child rows from pointing at it (their foreign
# key check waits), so "is it used?" stays true until a delete commits.


def lock_building(conn: psycopg.Connection, building_id: int) -> dict[str, Any] | None:
    """Lock a building until the transaction ends and return it, or None."""
    return conn.execute(
        "SELECT building_id, building_name FROM buildings WHERE building_id = %s FOR UPDATE",
        (building_id,),
    ).fetchone()


def lock_floor(conn: psycopg.Connection, floor_id: int) -> dict[str, Any] | None:
    """Lock a floor until the transaction ends and return it with its building's name, or None."""
    return conn.execute(
        """
        SELECT f.floor_id, f.floor_number, f.building_id, b.building_name
        FROM floors f
        JOIN buildings b ON b.building_id = f.building_id
        WHERE f.floor_id = %s
        FOR UPDATE OF f
        """,
        (floor_id,),
    ).fetchone()


def lock_seat(conn: psycopg.Connection, seat_id: int) -> dict[str, Any] | None:
    """Lock a seat until the transaction ends and return it with its floor's number, or None."""
    return conn.execute(
        """
        SELECT s.seat_id, s.seat_number, s.floor_id, f.floor_number
        FROM seats s
        JOIN floors f ON f.floor_id = s.floor_id
        WHERE s.seat_id = %s
        FOR UPDATE OF s
        """,
        (seat_id,),
    ).fetchone()


# --- usage --------------------------------------------------------------------------


def count_tickets(conn: psycopg.Connection, column: str, location_id: int) -> int:
    """How many tickets, closed ones included, point at this location.

    column is 'building_id', 'floor_id' or 'seat_id'; it's matched against a fixed list,
    never put into the SQL from outside.
    """
    queries = {
        "building_id": "SELECT count(*) AS n FROM tickets WHERE building_id = %s",
        "floor_id": "SELECT count(*) AS n FROM tickets WHERE floor_id = %s",
        "seat_id": "SELECT count(*) AS n FROM tickets WHERE seat_id = %s",
    }
    return conn.execute(queries[column], (location_id,)).fetchone()["n"]


def count_floors(conn: psycopg.Connection, building_id: int) -> int:
    """How many floors a building has, active or not."""
    return conn.execute(
        "SELECT count(*) AS n FROM floors WHERE building_id = %s", (building_id,)
    ).fetchone()["n"]


def count_seats(conn: psycopg.Connection, floor_id: int) -> int:
    """How many seats a floor has, active or not."""
    return conn.execute(
        "SELECT count(*) AS n FROM seats WHERE floor_id = %s", (floor_id,)
    ).fetchone()["n"]


# --- writes ---------------------------------------------------------------------------


def insert_building(conn: psycopg.Connection, building_name: str) -> int | None:
    """Add an active building and return its id, or None if the name is taken (any case)."""
    row = conn.execute(
        """
        INSERT INTO buildings (building_name) VALUES (%s)
        ON CONFLICT DO NOTHING
        RETURNING building_id
        """,
        (building_name,),
    ).fetchone()
    return row["building_id"] if row else None


def insert_floor(conn: psycopg.Connection, building_id: int, floor_number: int) -> int | None:
    """Add an active floor and return its id, or None if the building already has that number."""
    row = conn.execute(
        """
        INSERT INTO floors (building_id, floor_number) VALUES (%s, %s)
        ON CONFLICT DO NOTHING
        RETURNING floor_id
        """,
        (building_id, floor_number),
    ).fetchone()
    return row["floor_id"] if row else None


def insert_seat(conn: psycopg.Connection, floor_id: int, seat_number: str) -> int | None:
    """Add an active seat and return its id, or None if the floor already has it (any case)."""
    row = conn.execute(
        """
        INSERT INTO seats (floor_id, seat_number) VALUES (%s, %s)
        ON CONFLICT DO NOTHING
        RETURNING seat_id
        """,
        (floor_id, seat_number),
    ).fetchone()
    return row["seat_id"] if row else None


def _update_unless_duplicate(conn: psycopg.Connection, query: str, params: dict[str, Any]) -> bool:
    """Run an UPDATE; False if it would duplicate a name. The savepoint keeps the transaction usable."""
    try:
        with conn.transaction():
            conn.execute(query, params)
    except psycopg.errors.UniqueViolation:
        return False
    return True


def update_building(
    conn: psycopg.Connection, building_id: int, building_name: str | None, is_active: bool | None
) -> bool:
    """Rename and/or (de)activate a building; None leaves that field alone. False if the name is taken."""
    return _update_unless_duplicate(
        conn,
        """
        UPDATE buildings
        SET building_name = COALESCE(%(name)s, building_name),
            is_active = COALESCE(%(active)s, is_active)
        WHERE building_id = %(id)s
        """,
        {"name": building_name, "active": is_active, "id": building_id},
    )


def update_floor(
    conn: psycopg.Connection, floor_id: int, floor_number: int | None, is_active: bool | None
) -> bool:
    """Renumber and/or (de)activate a floor; None leaves that field alone. False if the number is taken."""
    return _update_unless_duplicate(
        conn,
        """
        UPDATE floors
        SET floor_number = COALESCE(%(number)s, floor_number),
            is_active = COALESCE(%(active)s, is_active)
        WHERE floor_id = %(id)s
        """,
        {"number": floor_number, "active": is_active, "id": floor_id},
    )


def update_seat(
    conn: psycopg.Connection, seat_id: int, seat_number: str | None, is_active: bool | None
) -> bool:
    """Renumber and/or (de)activate a seat; None leaves that field alone. False if the number is taken."""
    return _update_unless_duplicate(
        conn,
        """
        UPDATE seats
        SET seat_number = COALESCE(%(number)s, seat_number),
            is_active = COALESCE(%(active)s, is_active)
        WHERE seat_id = %(id)s
        """,
        {"number": seat_number, "active": is_active, "id": seat_id},
    )


def delete_building(conn: psycopg.Connection, building_id: int) -> None:
    """Delete a building. The caller checks first that nothing uses it."""
    conn.execute("DELETE FROM buildings WHERE building_id = %s", (building_id,))


def delete_floor(conn: psycopg.Connection, floor_id: int) -> None:
    """Delete a floor. The caller checks first that nothing uses it."""
    conn.execute("DELETE FROM floors WHERE floor_id = %s", (floor_id,))


def delete_seat(conn: psycopg.Connection, seat_id: int) -> None:
    """Delete a seat. The caller checks first that nothing uses it."""
    conn.execute("DELETE FROM seats WHERE seat_id = %s", (seat_id,))
