"""Postgres connection management. The only module that knows how to connect.

One module-level connection is reused across warm Lambda invocations and reset
after a failure so the next call reconnects. Services open a transaction and
pass the connection down to repositories:

    with db.transaction() as conn:
        user = user_repository.get_by_id(conn, user_id)
"""

import logging
import threading
from collections.abc import Iterator
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row

from config import settings

logger = logging.getLogger(__name__)

_conn: psycopg.Connection | None = None

# Uvicorn runs sync routes in a thread pool, and two requests must not interleave
# transactions on the shared connection. Lambda serves one request at a time anyway.
_lock = threading.Lock()


def _connect() -> psycopg.Connection:
    """Open a new connection. Autocommit, so SQL only runs in explicit transactions."""
    return psycopg.connect(
        host=settings.postgres_host,
        port=settings.postgres_port,
        dbname=settings.postgres_name,
        user=settings.postgres_user,
        password=settings.postgres_pass,
        sslmode=settings.postgres_sslmode,
        connect_timeout=5,
        autocommit=True,
        row_factory=dict_row,
    )


@contextmanager
def transaction() -> Iterator[psycopg.Connection]:
    """Yield a connection inside a transaction: commit on success, roll back on error."""
    global _conn
    with _lock:
        try:
            if _conn is None or _conn.closed:
                _conn = _connect()
            with _conn.transaction():
                yield _conn
        finally:
            if _conn is not None and (_conn.closed or _conn.broken):
                _conn = None


def ping() -> bool:
    """Return True if the database answers a trivial query."""
    try:
        with transaction() as conn:
            conn.execute("SELECT 1")
        return True
    except psycopg.Error:
        logger.exception("Database ping failed")
        return False
