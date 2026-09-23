"""Signing and verifying access tokens."""

import base64
import json
import logging
from datetime import UTC, datetime, timedelta

import jwt
import pytest

import tokens
from config import Settings, settings
from errors import UnauthorizedError


def _payload(token: str) -> dict:
    """Read a token's claims without verifying it (for inspecting what we signed)."""
    return jwt.decode(token, options={"verify_signature": False})


def _b64(data: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()


def test_round_trip() -> None:
    token, expires_in = tokens.create_access_token(7, "employee")
    assert tokens.decode_access_token(token) == tokens.TokenClaims(user_id=7, role="employee")
    assert expires_in == settings.jwt_expires_minutes * 60 == 3600


def test_token_holds_only_id_role_and_timing() -> None:
    token, _ = tokens.create_access_token(7, "engineer")
    payload = _payload(token)
    assert set(payload) == {"sub", "role", "iat", "exp", "iss"}
    assert payload["sub"] == "7"
    assert payload["role"] == "engineer"
    assert payload["exp"] - payload["iat"] == 3600
    assert jwt.get_unverified_header(token)["alg"] == "HS256"


def test_expired_token_is_rejected() -> None:
    two_hours_ago = datetime.now(UTC) - timedelta(hours=2)
    token, _ = tokens.create_access_token(7, "employee", now=two_hours_ago)
    with pytest.raises(UnauthorizedError, match="expired"):
        tokens.decode_access_token(token)


def _forge(payload: dict, secret: str = settings.jwt_secret, **kwargs) -> str:
    return jwt.encode(payload, secret, algorithm="HS256", **kwargs)


def _valid_payload(**overrides) -> dict:
    now = datetime.now(UTC)
    return {"sub": "7", "role": "employee", "iat": now, "exp": now + timedelta(hours=1), "iss": tokens.ISSUER, **overrides}


@pytest.mark.parametrize(
    "token_factory",
    [
        pytest.param(lambda: "not-a-jwt", id="garbage"),
        pytest.param(lambda: _forge(_valid_payload(), secret="another-secret-that-is-long-enough-00"), id="wrong secret"),
        pytest.param(lambda: _forge(_valid_payload(iss="someone-else")), id="wrong issuer"),
        pytest.param(lambda: _forge({k: v for k, v in _valid_payload().items() if k != "role"}), id="missing role"),
        pytest.param(lambda: _forge({k: v for k, v in _valid_payload().items() if k != "exp"}), id="missing exp"),
        pytest.param(lambda: _forge(_valid_payload(role="superuser")), id="unknown role"),
        pytest.param(lambda: _forge(_valid_payload(sub="seven")), id="non-numeric subject"),
        pytest.param(lambda: _forge(_valid_payload(sub="-1")), id="negative subject"),
    ],
)
def test_bad_tokens_are_rejected(token_factory) -> None:
    with pytest.raises(UnauthorizedError, match="Invalid token"):
        tokens.decode_access_token(token_factory())


def test_tampered_payload_fails_the_signature() -> None:
    token, _ = tokens.create_access_token(7, "employee")
    header, _payload_part, signature = token.split(".")
    promoted = _b64({**_payload(token), "role": "admin"})
    with pytest.raises(UnauthorizedError, match="Invalid token"):
        tokens.decode_access_token(f"{header}.{promoted}.{signature}")


def test_unsigned_alg_none_token_is_rejected() -> None:
    now = int(datetime.now(UTC).timestamp())
    body = {"sub": "7", "role": "admin", "iat": now, "exp": now + 3600, "iss": tokens.ISSUER}
    unsigned = f"{_b64({'alg': 'none', 'typ': 'JWT'})}.{_b64(body)}."
    with pytest.raises(UnauthorizedError, match="Invalid token"):
        tokens.decode_access_token(unsigned)


# --- the signing secret ---------------------------------------------------------


def _use_settings(monkeypatch, **kwargs) -> None:
    monkeypatch.setattr(tokens, "settings", Settings(**kwargs))
    monkeypatch.setattr(tokens, "_local_secret", None)


def test_secret_is_required_in_aws(monkeypatch) -> None:
    _use_settings(monkeypatch, is_local=False, jwt_secret="")
    with pytest.raises(RuntimeError, match="JWT_SECRET is not set"):
        tokens.create_access_token(7, "employee")


def test_short_secret_is_refused(monkeypatch) -> None:
    _use_settings(monkeypatch, is_local=False, jwt_secret="too-short")
    with pytest.raises(RuntimeError, match="at least 32 characters"):
        tokens.create_access_token(7, "employee")


def test_local_without_secret_uses_one_random_secret_per_process(monkeypatch, caplog) -> None:
    _use_settings(monkeypatch, is_local=True, jwt_secret="")
    with caplog.at_level(logging.WARNING, logger="tokens"):
        token, _ = tokens.create_access_token(7, "employee")
        assert tokens.decode_access_token(token).user_id == 7

    assert len(tokens._local_secret) >= tokens.MIN_SECRET_LENGTH
    # Warned once, not on every call.
    assert [r.message for r in caplog.records].count(
        "JWT_SECRET is not set; using a random secret until this process exits"
    ) == 1


def test_secrets_are_left_out_of_settings_repr() -> None:
    shown = repr(settings)
    assert "jwt_secret" not in shown and settings.jwt_secret not in shown
    # The local password ("test") also appears in the user and database names, so check the field.
    assert "postgres_pass" not in shown
