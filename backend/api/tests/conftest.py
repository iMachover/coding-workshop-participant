"""
Shared pytest fixtures.

Tests run against a real PostgreSQL database (default: project_tracker_test on
localhost, as postgres/postgres123 like bin/setup-environment.sh; create it once
with `createdb`, see README). The schema is dropped and rebuilt from the
migrations once per session, then the seed is applied, so tests exercise the
real migration path.
"""

import os

import psycopg
import pytest

# Environment must be set before the app modules read settings.
os.environ.setdefault("IS_LOCAL", "true")
os.environ.setdefault("JWT_SECRET", "test-secret-not-for-production")
os.environ.setdefault("JWT_EXPIRES_MINUTES", "60")
os.environ.setdefault("POSTGRES_HOST", "localhost")
os.environ.setdefault("POSTGRES_PORT", "5432")
os.environ.setdefault("POSTGRES_NAME", "project_tracker_test")
os.environ.setdefault("POSTGRES_USER", "postgres")
os.environ.setdefault("POSTGRES_PASS", "postgres123")  # nosec B105 - local dev default

from fastapi.testclient import TestClient  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.db import connection as db  # noqa: E402
from app.main import app  # noqa: E402

SEED_EMPLOYEE = {"username": "emp001", "password": "Employee123!"}
SEED_ADMIN = {"username": "adm001", "password": "Admin123!"}


@pytest.fixture(scope="session", autouse=True)
def fresh_schema():
    """Rebuild the test database schema from scratch once per test session."""
    get_settings.cache_clear()
    with psycopg.connect(get_settings().postgres_conninfo) as conn:
        conn.execute("DROP SCHEMA public CASCADE")
        conn.execute("CREATE SCHEMA public")
        conn.commit()
    db.reset_connection()
    db._schema_ready = False  # noqa: SLF001 - test-only reset of module state
    db.ensure_schema()
    yield
    db.reset_connection()


@pytest.fixture
def client() -> TestClient:
    """HTTP client bound to the FastAPI app (no network, no Lambda)."""
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def conn() -> psycopg.Connection:
    """Direct database connection for arranging test data."""
    return db.get_connection()


def login(client: TestClient, username: str, password: str) -> str:
    """Log in through the API and return the token."""
    response = client.post("/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["token"]


@pytest.fixture
def employee_token(client: TestClient) -> str:
    """A valid token for the seeded employee."""
    return login(client, **SEED_EMPLOYEE)
