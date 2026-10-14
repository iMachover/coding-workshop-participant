"""
PostgreSQL connection management.

One module-level connection is reused across Lambda invocations within the
same container (same strategy as backend/_examples/python-service). The first
request in a container also applies pending migrations and the seed.
"""

import contextlib
import logging
from collections.abc import Iterator

import psycopg
from psycopg.rows import dict_row

from app.core.config import get_settings
from app.core.errors import AppError

logger = logging.getLogger(__name__)

_conn: psycopg.Connection | None = None
_schema_ready = False


def get_connection() -> psycopg.Connection:
    """Return the shared connection, reconnecting if it was closed."""
    global _conn
    if _conn is None or _conn.closed:
        _conn = psycopg.connect(get_settings().postgres_conninfo, row_factory=dict_row)
    return _conn


def reset_connection() -> None:
    """Drop the shared connection so the next call reconnects."""
    global _conn
    if _conn is not None:
        with contextlib.suppress(Exception):  # best effort; the connection is discarded anyway
            _conn.close()
    _conn = None


def ensure_schema() -> None:
    """Apply migrations and seed once per process. Safe to call repeatedly."""
    global _schema_ready
    if _schema_ready:
        return
    # Imported here to avoid an import cycle (migrations use the connection).
    from app.db.migrations import apply_migrations
    from app.db.seed import apply_seed

    conn = get_connection()
    apply_migrations(conn)
    apply_seed(conn)
    _schema_ready = True


def get_db() -> Iterator[psycopg.Connection]:
    """FastAPI dependency: yields a ready connection, commits or rolls back."""
    try:
        ensure_schema()
        conn = get_connection()
    except psycopg.Error as exc:
        logger.error("Database unavailable: %s", exc)
        reset_connection()
        raise AppError(503, "DATABASE_UNAVAILABLE", "Database is unavailable") from exc
    try:
        yield conn
        conn.commit()
    except psycopg.Error as exc:
        logger.error("Database error: %s", exc)
        conn.rollback()
        reset_connection()
        raise AppError(500, "DATABASE_ERROR", "A database error occurred") from exc
    except Exception:
        conn.rollback()
        raise
