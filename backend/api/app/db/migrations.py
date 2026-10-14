"""
Minimal SQL migration runner.

Migrations are numbered .sql files in backend/api/db/migrations. Applied
versions are recorded in schema_migrations. An advisory lock prevents two
cold-starting Lambda containers from migrating at the same time.
"""

import logging
from pathlib import Path

import psycopg

logger = logging.getLogger(__name__)

MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "db" / "migrations"
_LOCK_KEY = 727001  # arbitrary application-wide advisory lock id


def pending_migrations(conn: psycopg.Connection, migrations_dir: Path = MIGRATIONS_DIR) -> list[Path]:
    """Return migration files that have not been applied yet, in order."""
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version    TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        cur.execute("SELECT version FROM schema_migrations")
        applied = {row["version"] for row in cur.fetchall()}
    conn.commit()
    return [path for path in sorted(migrations_dir.glob("*.sql")) if path.name not in applied]


def apply_migrations(conn: psycopg.Connection, migrations_dir: Path = MIGRATIONS_DIR) -> list[str]:
    """Apply all pending migrations. Returns the versions applied."""
    applied: list[str] = []
    with conn.cursor() as cur:
        cur.execute("SELECT pg_advisory_lock(%s)", (_LOCK_KEY,))
    conn.commit()
    try:
        for path in pending_migrations(conn, migrations_dir):
            logger.info("Applying migration %s", path.name)
            with conn.cursor() as cur:
                cur.execute(path.read_text(encoding="utf-8"))
                cur.execute("INSERT INTO schema_migrations (version) VALUES (%s)", (path.name,))
            conn.commit()
            applied.append(path.name)
    except Exception:
        conn.rollback()
        raise
    finally:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_unlock(%s)", (_LOCK_KEY,))
        conn.commit()
    return applied
