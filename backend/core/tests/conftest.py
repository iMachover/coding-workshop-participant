"""Shared fixtures. Tests run against a separate database, so dev data is never touched.

The schema is rebuilt once per run, and users/tickets/notes are emptied before every
test. The seeded buildings, floors and seats stay, since nothing in the API changes them.
"""

import os

# Settings are read at import time, so point them at the test database first.
os.environ["IS_LOCAL"] = "true"
os.environ["POSTGRES_NAME"] = os.environ.get("TEST_POSTGRES_NAME", "codingworkshop_test")

from collections.abc import Callable  # noqa: E402
from pathlib import Path  # noqa: E402
from typing import Any  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import db  # noqa: E402
import security  # noqa: E402
from config import settings  # noqa: E402
from function import API_PREFIX, app  # noqa: E402

SQL_DIR = Path(__file__).resolve().parent.parent / "sql"

Headers = dict[str, str]


@pytest.fixture(scope="session", autouse=True)
def _test_database() -> None:
    """Rebuild the test schema once. Refuses to run against a non-test database."""
    if not settings.postgres_name.endswith("_test"):
        pytest.exit(f"Refusing to run tests against '{settings.postgres_name}'", returncode=2)
    if not db.ping():
        pytest.exit(
            f"Can't reach Postgres database '{settings.postgres_name}'. "
            "See 'Running the tests' in README.md.",
            returncode=2,
        )
    with db.transaction() as conn:
        for name in ("reset.sql", "schema.sql", "seed.sql"):
            conn.execute((SQL_DIR / name).read_text())


@pytest.fixture(autouse=True)
def _empty_tables() -> None:
    """Start every test with no users, tickets or notes."""
    with db.transaction() as conn:
        conn.execute("TRUNCATE ticket_notes, tickets, users RESTART IDENTITY CASCADE")


@pytest.fixture(autouse=True)
def _fast_hashing(monkeypatch: pytest.MonkeyPatch) -> None:
    """Real hashing takes ~0.1s per call; tests don't need that strength."""
    monkeypatch.setattr(security, "ITERATIONS", 1_000)


@pytest.fixture
def client() -> TestClient:
    """HTTP client for the app."""
    return TestClient(app)


@pytest.fixture
def api() -> str:
    """URL prefix every route is served under."""
    return API_PREFIX


@pytest.fixture
def run_sql() -> Callable[..., list[dict[str, Any]]]:
    """Run SQL directly, for setup the API can't do yet (close, assign) and for checks."""

    def _run(query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        with db.transaction() as conn:
            cur = conn.execute(query, params)
            return cur.fetchall() if cur.description else []

    return _run


@pytest.fixture
def register(client: TestClient, api: str) -> Callable[..., dict[str, Any]]:
    """Register a user through the API and return it."""

    def _register(
        email: str = "jane@acme.inc", full_name: str = "Jane Doe", password: str = "password123"
    ) -> dict[str, Any]:
        response = client.post(
            f"{api}/auth/register",
            json={"email": email, "full_name": full_name, "password": password},
        )
        assert response.status_code == 201, response.text
        return response.json()

    return _register


@pytest.fixture
def jane(register: Callable[..., dict[str, Any]]) -> Headers:
    """Headers for a registered employee."""
    return {"X-User-Id": str(register()["user_id"])}


@pytest.fixture
def eve(register: Callable[..., dict[str, Any]]) -> Headers:
    """Headers for a second employee, to check one can't see the other's tickets."""
    return {"X-User-Id": str(register("eve@acme.inc", "Eve Other")["user_id"])}


@pytest.fixture
def loc(run_sql: Callable[..., list[dict[str, Any]]]) -> dict[str, int]:
    """Seeded location ids by name, e.g. loc['A3'] is Building A floor 3, loc['A301'] its seat 301."""
    ids: dict[str, int] = {}
    for row in run_sql("SELECT building_id, building_name FROM buildings"):
        ids[row["building_name"][-1]] = row["building_id"]
    for row in run_sql(
        "SELECT f.floor_id, f.floor_number, b.building_name FROM floors f "
        "JOIN buildings b USING (building_id)"
    ):
        ids[f"{row['building_name'][-1]}{row['floor_number']}"] = row["floor_id"]
    for row in run_sql(
        "SELECT s.seat_id, s.seat_number, b.building_name FROM seats s "
        "JOIN floors f USING (floor_id) JOIN buildings b USING (building_id)"
    ):
        ids[f"{row['building_name'][-1]}{row['seat_number']}"] = row["seat_id"]
    return ids


@pytest.fixture
def ticket_payload(loc: dict[str, int]) -> Callable[..., dict[str, Any]]:
    """A valid create-ticket body (scope 'me' at A / floor 3 / seat 301), with overrides."""

    def _payload(**overrides: Any) -> dict[str, Any]:
        body = {
            "title": "Wi-Fi keeps dropping",
            "short_description": "Disconnects every few minutes",
            "description": "My laptop loses Wi-Fi every 5-10 minutes.",
            "category": "network",
            "urgency": "medium",
            "affected_scope": "me",
            "building_id": loc["A"],
            "floor_id": loc["A3"],
            "seat_id": loc["A301"],
        }
        body.update(overrides)
        return {k: v for k, v in body.items() if v is not None}

    return _payload


@pytest.fixture
def create_ticket(
    client: TestClient, api: str, ticket_payload: Callable[..., dict[str, Any]]
) -> Callable[..., dict[str, Any]]:
    """Create a ticket through the API and return it."""

    def _create(headers: Headers, **overrides: Any) -> dict[str, Any]:
        response = client.post(f"{api}/tickets", json=ticket_payload(**overrides), headers=headers)
        assert response.status_code == 201, response.text
        return response.json()

    return _create
