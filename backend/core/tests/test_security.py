"""Password hashing."""

import security


def test_hash_then_verify_round_trips() -> None:
    stored = security.hash_password("correct horse")
    assert security.verify_password("correct horse", stored)


def test_wrong_password_fails() -> None:
    stored = security.hash_password("correct horse")
    assert not security.verify_password("wrong horse", stored)


def test_hash_is_salted_and_self_describing() -> None:
    first = security.hash_password("same password")
    second = security.hash_password("same password")
    assert first != second
    algorithm, iterations, _salt, _digest = first.split("$")
    assert algorithm == "pbkdf2_sha256"
    assert int(iterations) == security.ITERATIONS


def test_hash_never_contains_the_password() -> None:
    assert "hunter2hunter2" not in security.hash_password("hunter2hunter2")


def test_old_hashes_still_verify_after_iterations_change(monkeypatch) -> None:
    stored = security.hash_password("pw")
    monkeypatch.setattr(security, "ITERATIONS", security.ITERATIONS * 2)
    assert security.verify_password("pw", stored)


def test_malformed_or_foreign_hashes_fail() -> None:
    assert not security.verify_password("pw", "not-a-hash")
    assert not security.verify_password("pw", "bcrypt$1$abc$def")
