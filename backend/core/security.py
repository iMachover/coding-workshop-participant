"""Password hashing with stdlib PBKDF2, so there is no compiled dependency to ship to Lambda."""

import base64
import hashlib
import hmac
import secrets

ALGORITHM = "pbkdf2_sha256"
# OWASP's current recommendation for PBKDF2-HMAC-SHA256. Stored in each hash, so it can
# be raised later without breaking existing passwords.
ITERATIONS = 600_000
SALT_BYTES = 16


def _b64(raw: bytes) -> str:
    """Encode bytes as unpadded base64 text."""
    return base64.b64encode(raw).decode("ascii").rstrip("=")


def _unb64(text: str) -> bytes:
    """Decode unpadded base64 text back to bytes."""
    return base64.b64decode(text + "=" * (-len(text) % 4))


def hash_password(password: str) -> str:
    """Return a salted hash in the form 'pbkdf2_sha256$iterations$salt$hash'."""
    salt = secrets.token_bytes(SALT_BYTES)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS)
    return f"{ALGORITHM}${ITERATIONS}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored_hash: str) -> bool:
    """Check a password against a stored hash in constant time."""
    try:
        algorithm, iterations, salt, expected = stored_hash.split("$")
    except ValueError:
        return False
    if algorithm != ALGORITHM:
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), _unb64(salt), int(iterations))
    return hmac.compare_digest(digest, _unb64(expected))


# Checked when a login email doesn't exist, so a wrong email takes as long as a wrong
# password and response timing doesn't reveal which emails are registered.
DUMMY_HASH = hash_password(secrets.token_urlsafe(16))
