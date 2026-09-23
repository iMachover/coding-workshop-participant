"""Register, login and the X-User-Id identity check."""

import pytest


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


def test_login_returns_the_user(client, api, register) -> None:
    user = register()
    response = client.post(
        f"{api}/auth/login", json={"email": "JANE@acme.inc", "password": "password123"}
    )
    assert response.status_code == 200
    assert response.json() == user


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


@pytest.mark.parametrize(
    ("headers", "detail"),
    [
        ({}, "Missing or invalid X-User-Id header"),
        ({"X-User-Id": "abc"}, "Missing or invalid X-User-Id header"),
        ({"X-User-Id": "0"}, "Missing or invalid X-User-Id header"),
        ({"X-User-Id": "-1"}, "Missing or invalid X-User-Id header"),
        ({"X-User-Id": "99999999999999"}, "Missing or invalid X-User-Id header"),
        ({"X-User-Id": "999"}, "Unknown user"),
    ],
)
def test_me_rejects_missing_or_unknown_callers(client, api, headers, detail) -> None:
    response = client.get(f"{api}/auth/me", headers=headers)
    assert response.status_code == 401
    assert response.json() == {"detail": detail}
