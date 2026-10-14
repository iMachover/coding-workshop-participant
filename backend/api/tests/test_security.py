"""Unit tests for password hashing and token helpers."""

from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_hash_and_verify_roundtrip():
    hashed = hash_password("Correct horse battery staple")
    assert hashed != "Correct horse battery staple"
    assert hashed.startswith("$2b$")
    assert verify_password("Correct horse battery staple", hashed)
    assert not verify_password("wrong", hashed)


def test_verify_with_missing_hash_is_false():
    assert verify_password("anything", None) is False


def test_token_roundtrip_contains_identity_claims():
    token, expires_in = create_access_token(42, "emp001", "employee")
    assert expires_in == get_settings().jwt_expires_minutes * 60
    claims = decode_access_token(token)
    assert claims["sub"] == "42"
    assert claims["username"] == "emp001"
    assert claims["role"] == "employee"
    assert claims["exp"] > claims["iat"]


def test_expired_token_is_rejected():
    settings = get_settings()
    past = datetime.now(timezone.utc) - timedelta(minutes=5)
    token = jwt.encode(
        {"sub": "1", "iat": past - timedelta(minutes=1), "exp": past},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    with pytest.raises(AppError) as excinfo:
        decode_access_token(token)
    assert excinfo.value.status_code == 401
    assert excinfo.value.code == "TOKEN_EXPIRED"


def test_token_signed_with_other_secret_is_rejected():
    token = jwt.encode(
        {"sub": "1", "exp": datetime.now(timezone.utc) + timedelta(minutes=5)},
        "someone-elses-secret",
        algorithm="HS256",
    )
    with pytest.raises(AppError) as excinfo:
        decode_access_token(token)
    assert excinfo.value.code == "TOKEN_INVALID"


def test_unsigned_token_is_rejected():
    token = jwt.encode({"sub": "1"}, key=None, algorithm="none")
    with pytest.raises(AppError) as excinfo:
        decode_access_token(token)
    assert excinfo.value.code == "TOKEN_INVALID"
