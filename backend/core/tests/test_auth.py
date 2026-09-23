"""Register, login, and how protected routes check the Bearer token."""

from datetime import UTC, datetime, timedelta

import jwt
import pytest

import tokens
from deps import MISSING_TOKEN
from services.auth_service import ROLE_CHANGED


def _register(client, api, **overrides):
    body = {"email": "jane@acme.inc", "full_name": "Jane Doe", "password": "password123"}
    return client.post(f"{api}/auth/register", json={**body, **overrides})


def test_register_creates_an_employee(client, api, run_sql) -> None:
    response = _register(client, api, email="  Jane@ACME.inc ", phone_number="555-0101")

    assert response.status_code == 201
    user = response.json()
    assert user["email"] == "jane@acme.inc"
    assert user["role"] == "employee"
    assert user["phone_number"] == "555-0101"
    assert "password_hash" not in user and "password" not in user
    stored = run_sql("SELECT password_hash FROM users WHERE user_id = %s", (user["user_id"],))
    assert stored[0]["password_hash"].startswith("pbkdf2_sha256$")


def test_register_ignores_a_requested_role(client, api) -> None:
    assert _register(client, api, role="admin").json()["role"] == "employee"


def test_register_duplicate_email_is_409_regardless_of_case(client, api) -> None:
    _register(client, api)
    response = _register(client, api, email="JANE@acme.inc")
    assert response.status_code == 409
    assert response.json() == {"detail": "An account with this email already exists"}


@pytest.mark.parametrize(
    "overrides",
    [{"email": "jane@gmail.com"}, {"password": "short"}, {"full_name": "  "}, {"email": None}],
)
def test_register_rejects_invalid_input(client, api, overrides) -> None:
    assert _register(client, api, **overrides).status_code == 422


def test_login_returns_a_token_and_the_user(client, api, register) -> None:
    user = register()
    response = client.post(
        f"{api}/auth/login", json={"email": "JANE@acme.inc", "password": "password123"}
    )
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"access_token", "token_type", "expires_in", "user"}
    assert body["user"] == user
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 3600
    assert "password" not in response.text and "password_hash" not in response.text
    claims = tokens.decode_access_token(body["access_token"])
    assert claims == tokens.TokenClaims(user_id=user["user_id"], role="employee")


def test_login_signs_the_role_currently_in_the_database(client, api, register, set_role) -> None:
    user = register()
    set_role(user["user_id"], "engineer")

    response = client.post(f"{api}/auth/login", json={"email": "jane@acme.inc", "password": "password123"})

    assert response.json()["user"]["role"] == "engineer"
    assert tokens.decode_access_token(response.json()["access_token"]).role == "engineer"


@pytest.mark.parametrize(
    "credentials",
    [
        {"email": "jane@acme.inc", "password": "wrong-password"},
        {"email": "nobody@acme.inc", "password": "password123"},
    ],
)
def test_login_failures_share_one_message(client, api, register, credentials) -> None:
    register()
    response = client.post(f"{api}/auth/login", json=credentials)
    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid email or password"}


def test_me_returns_the_caller(client, api, jane) -> None:
    response = client.get(f"{api}/auth/me", headers=jane)
    assert response.status_code == 200
    assert response.json()["email"] == "jane@acme.inc"


def test_the_token_from_login_signs_the_caller_in(client, api, register) -> None:
    register()
    login = client.post(f"{api}/auth/login", json={"email": "jane@acme.inc", "password": "password123"})
    token = login.json()["access_token"]

    response = client.get(f"{api}/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json() == login.json()["user"]


def _expired_token(user_id: int) -> str:
    token, _ = tokens.create_access_token(user_id, "employee", now=datetime.now(UTC) - timedelta(hours=2))
    return token


def _foreign_token(user_id: int) -> str:
    """Well-formed and unexpired, but signed with someone else's secret."""
    now = datetime.now(UTC)
    payload = {"sub": str(user_id), "role": "employee", "iat": now, "exp": now + timedelta(hours=1), "iss": tokens.ISSUER}
    return jwt.encode(payload, "another-secret-that-is-long-enough-00", algorithm="HS256")


@pytest.mark.parametrize(
    ("authorization", "detail"),
    [
        pytest.param(None, MISSING_TOKEN, id="no header"),
        pytest.param("Basic amFuZTpwdw==", MISSING_TOKEN, id="not bearer"),
        pytest.param("Bearer", MISSING_TOKEN, id="bearer without token"),
        pytest.param("Bearer not-a-jwt", tokens.INVALID_TOKEN, id="garbage token"),
        pytest.param(lambda uid: f"Bearer {_foreign_token(uid)}", tokens.INVALID_TOKEN, id="wrong secret"),
        pytest.param(lambda uid: f"Bearer {_expired_token(uid)}", tokens.EXPIRED_TOKEN, id="expired"),
    ],
)
def test_protected_routes_reject_bad_credentials(client, api, jane_user, authorization, detail) -> None:
    if callable(authorization):
        authorization = authorization(jane_user["user_id"])
    headers = {} if authorization is None else {"Authorization": authorization}

    response = client.get(f"{api}/auth/me", headers=headers)

    assert response.status_code == 401
    assert response.json() == {"detail": detail}


def test_a_deleted_users_token_stops_working(client, api, jane, jane_user, run_sql) -> None:
    run_sql("DELETE FROM users WHERE user_id = %s", (jane_user["user_id"],))
    response = client.get(f"{api}/auth/me", headers=jane)
    assert response.status_code == 401
    assert response.json() == {"detail": "Unknown user"}


@pytest.mark.parametrize("new_role", ["engineer", "admin"])
def test_a_token_stops_working_when_the_role_changes(client, api, jane, jane_user, set_role, new_role) -> None:
    set_role(jane_user["user_id"], new_role)
    response = client.get(f"{api}/auth/me", headers=jane)
    assert response.status_code == 401
    assert response.json() == {"detail": ROLE_CHANGED}


def test_the_old_x_user_id_header_no_longer_signs_anyone_in(client, api, jane_user) -> None:
    response = client.get(f"{api}/auth/me", headers={"X-User-Id": str(jane_user["user_id"])})
    assert response.status_code == 401
    assert response.json() == {"detail": MISSING_TOKEN}


def test_x_user_id_is_ignored_next_to_a_bearer_token(client, api, jane, eve_user) -> None:
    response = client.get(f"{api}/auth/me", headers={**jane, "X-User-Id": str(eve_user["user_id"])})
    assert response.json()["email"] == "jane@acme.inc"
