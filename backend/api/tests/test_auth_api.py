"""Integration tests for /auth/login and /me against the real database."""

from tests.conftest import SEED_ADMIN, SEED_EMPLOYEE, login


def _error(response):
    body = response.json()
    assert body["success"] is False
    return body["error"]


def test_health_is_public(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_login_success_returns_token_and_public_user(client):
    response = client.post("/auth/login", json=SEED_EMPLOYEE)
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "Bearer"
    assert body["expires_in"] == 3600
    assert body["token"].count(".") == 2
    user = body["user"]
    assert user["username"] == "emp001"
    assert user["role"] == "employee"
    assert "password_hash" not in user
    assert "hourly_rate" not in user


def test_login_trims_username(client):
    response = client.post("/auth/login", json={"username": "  emp001 ", "password": SEED_EMPLOYEE["password"]})
    assert response.status_code == 200


def test_login_wrong_password(client):
    response = client.post("/auth/login", json={"username": "emp001", "password": "nope"})
    assert response.status_code == 401
    error = _error(response)
    assert error["code"] == "INVALID_CREDENTIALS"
    assert error["message"] == "Invalid username or password"


def test_login_unknown_user_gives_same_error(client):
    response = client.post("/auth/login", json={"username": "zzz999", "password": "nope"})
    assert response.status_code == 401
    assert _error(response) == {"code": "INVALID_CREDENTIALS", "message": "Invalid username or password"}


def test_login_missing_fields_is_400_with_field_errors(client):
    response = client.post("/auth/login", json={"username": "emp001"})
    assert response.status_code == 400
    error = _error(response)
    assert error["code"] == "VALIDATION_ERROR"
    assert "password" in error["fields"]


def test_login_malformed_json_is_400(client):
    response = client.post("/auth/login", content="not json", headers={"Content-Type": "application/json"})
    assert response.status_code == 400
    assert _error(response)["code"] == "VALIDATION_ERROR"


def test_archived_user_cannot_login(client, conn):
    with conn.cursor() as cur:
        cur.execute("UPDATE users SET is_archived = TRUE WHERE username = 'emp003'")
    conn.commit()
    try:
        response = client.post("/auth/login", json={"username": "emp003", "password": "Employee123!"})
        assert response.status_code == 401
        assert _error(response)["code"] == "INVALID_CREDENTIALS"
    finally:
        with conn.cursor() as cur:
            cur.execute("UPDATE users SET is_archived = FALSE WHERE username = 'emp003'")
        conn.commit()


def test_me_requires_token(client):
    response = client.get("/me")
    assert response.status_code == 401
    assert _error(response)["code"] == "UNAUTHORIZED"
    assert response.headers["www-authenticate"] == "Bearer"


def test_me_rejects_non_bearer_scheme(client, employee_token):
    response = client.get("/me", headers={"Authorization": f"Basic {employee_token}"})
    assert response.status_code == 401


def test_me_rejects_tampered_token(client, employee_token):
    tampered = employee_token[:-4] + ("AAAA" if not employee_token.endswith("AAAA") else "BBBB")
    response = client.get("/me", headers={"Authorization": f"Bearer {tampered}"})
    assert response.status_code == 401
    assert _error(response)["code"] == "TOKEN_INVALID"


def test_me_returns_current_user(client, employee_token):
    response = client.get("/me", headers={"Authorization": f"Bearer {employee_token}"})
    assert response.status_code == 200
    body = response.json()
    assert body["username"] == "emp001"
    assert body["first_name"] == "Sam"
    assert "password_hash" not in body


def test_me_for_archived_user_is_rejected_even_with_valid_token(client, conn):
    token = login(client, "emp002", "Employee123!")
    with conn.cursor() as cur:
        cur.execute("UPDATE users SET is_archived = TRUE WHERE username = 'emp002'")
    conn.commit()
    try:
        response = client.get("/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 401
    finally:
        with conn.cursor() as cur:
            cur.execute("UPDATE users SET is_archived = FALSE WHERE username = 'emp002'")
        conn.commit()


def test_admin_login_carries_role(client):
    token = login(client, **SEED_ADMIN)
    response = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert response.json()["role"] == "admin"


def test_unknown_route_uses_error_envelope(client):
    response = client.get("/does-not-exist")
    assert response.status_code == 404
    assert _error(response)["code"] == "NOT_FOUND"
