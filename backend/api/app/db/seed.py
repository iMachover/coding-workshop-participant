"""
Idempotent development seed.

Creates the accounts the Employee MVP needs until the Admin flow exists.
A user is only inserted when the username is missing, so re-running on every
cold start is cheap and never overwrites real data. Dev passwords are listed
in backend/api/README.md; change them before any shared deployment.
"""

import logging

import psycopg

from app.core.security import hash_password

logger = logging.getLogger(__name__)

# username (6 chars), password, first, last, email, job title, role, hourly rate.
# The literal passwords are development-only seed credentials (bandit B105 is suppressed per line).
SEED_USERS: list[dict] = [
    {
        "username": "adm001",
        "password": "Admin123!",  # nosec B105
        "first_name": "Ada",
        "last_name": "Admin",
        "email": "ada.admin@acme.test",
        "job_title": "System Administrator",
        "role": "admin",
        "hourly_rate": 0,
        "manager_username": None,
    },
    {
        "username": "mgr001",
        "password": "Manager123!",  # nosec B105
        "first_name": "Morgan",
        "last_name": "Lee",
        "email": "morgan.lee@acme.test",
        "job_title": "Infrastructure Manager",
        "role": "manager",
        "hourly_rate": 85,
        "manager_username": None,
    },
    {
        "username": "emp001",
        "password": "Employee123!",  # nosec B105
        "first_name": "Sam",
        "last_name": "Rivera",
        "email": "sam.rivera@acme.test",
        "job_title": "Systems Engineer",
        "role": "employee",
        "hourly_rate": 60,
        "manager_username": "mgr001",
    },
    {
        "username": "emp002",
        "password": "Employee123!",  # nosec B105
        "first_name": "Priya",
        "last_name": "Natarajan",
        "email": "priya.natarajan@acme.test",
        "job_title": "Network Engineer",
        "role": "employee",
        "hourly_rate": 65,
        "manager_username": "mgr001",
    },
    {
        "username": "emp003",
        "password": "Employee123!",  # nosec B105
        "first_name": "Jordan",
        "last_name": "Okafor",
        "email": "jordan.okafor@acme.test",
        "job_title": "Datacenter Technician",
        "role": "employee",
        "hourly_rate": 45,
        "manager_username": "mgr001",
    },
]


def apply_seed(conn: psycopg.Connection) -> int:
    """Insert any missing seed users. Returns how many were created."""
    created = 0
    with conn.cursor() as cur:
        cur.execute("SELECT username, id FROM users")
        existing = {row["username"]: row["id"] for row in cur.fetchall()}

        for user in SEED_USERS:
            if user["username"] in existing:
                continue
            manager_id = existing.get(user["manager_username"]) if user["manager_username"] else None
            cur.execute(
                """
                INSERT INTO users
                    (username, password_hash, first_name, last_name, email,
                     job_title, role, hourly_rate, manager_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    user["username"],
                    hash_password(user["password"]),
                    user["first_name"],
                    user["last_name"],
                    user["email"].lower(),
                    user["job_title"],
                    user["role"],
                    user["hourly_rate"],
                    manager_id,
                ),
            )
            existing[user["username"]] = cur.fetchone()["id"]
            created += 1
    conn.commit()
    if created:
        logger.info("Seeded %d user(s)", created)
    return created
