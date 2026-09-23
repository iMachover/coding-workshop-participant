"""Health checks, and how function.py turns errors into HTTP responses."""

import pytest
from fastapi.testclient import TestClient

import db
from errors import BadRequestError, ConflictError, NotFoundError, UnauthorizedError
from function import app
from services import location_service


def test_health(client, api) -> None:
    response = client.get(f"{api}/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_db_ok(client, api) -> None:
    response = client.get(f"{api}/health/db")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "db": "ok"}


def test_health_db_unavailable(client, api, monkeypatch) -> None:
    monkeypatch.setattr(db, "ping", lambda: False)
    response = client.get(f"{api}/health/db")
    assert response.status_code == 503
    assert response.json() == {"status": "error", "db": "unavailable"}


@pytest.mark.parametrize(
    ("error", "status"),
    [(BadRequestError, 400), (UnauthorizedError, 401), (NotFoundError, 404), (ConflictError, 409)],
)
def test_domain_errors_map_to_status_codes(client, api, jane, monkeypatch, error, status) -> None:
    def fail() -> None:
        raise error("explained to the client")

    monkeypatch.setattr(location_service, "list_buildings", fail)
    response = client.get(f"{api}/buildings", headers=jane)
    assert response.status_code == status
    assert response.json() == {"detail": "explained to the client"}


def test_unexpected_errors_return_generic_json_500(api, jane, monkeypatch) -> None:
    def crash() -> None:
        raise RuntimeError("secret internals")

    monkeypatch.setattr(location_service, "list_buildings", crash)
    response = TestClient(app, raise_server_exceptions=False).get(f"{api}/buildings", headers=jane)
    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error"}
    assert "secret" not in response.text
