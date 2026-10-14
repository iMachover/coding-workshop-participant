"""Tests for the require_roles dependency."""

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.core.deps import require_roles
from app.core.errors import register_error_handlers
from tests.conftest import SEED_ADMIN, SEED_EMPLOYEE, login


def _app_with_admin_route() -> FastAPI:
    app = FastAPI()
    register_error_handlers(app)

    @app.get("/admin-only")
    def admin_only(user=Depends(require_roles("admin"))):
        return {"username": user["username"]}

    return app


def test_require_roles_allows_matching_role(client):
    token = login(client, **SEED_ADMIN)
    response = TestClient(_app_with_admin_route()).get("/admin-only", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["username"] == "adm001"


def test_list_users_allows_admin(client):
    token = login(client, **SEED_ADMIN)
    response = client.get("/users", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200, response.text
    page = response.json()
    usernames = [u["username"] for u in page["items"]]
    assert {"adm001", "mgr001", "emp001"} <= set(usernames)
    assert all("password_hash" not in u for u in page["items"])
    assert page["total"] == len(page["items"])


def test_list_users_forbids_employee(client):
    token = login(client, **SEED_EMPLOYEE)
    response = client.get("/users", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


def test_list_users_requires_token(client):
    response = client.get("/users")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_require_roles_forbids_other_roles(client):
    token = login(client, **SEED_EMPLOYEE)
    response = TestClient(_app_with_admin_route()).get("/admin-only", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"
