"""
Command-line helper: apply migrations and seed against the configured database.

Usage (from backend/api with the virtualenv active):
    JWT_SECRET=dev POSTGRES_NAME=project_tracker python -m app.db.bootstrap
"""

import logging

from app.db.connection import ensure_schema, get_connection


def main() -> None:
    """Apply pending migrations and the seed, then print a summary."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    ensure_schema()
    with get_connection().cursor() as cur:
        cur.execute("SELECT version FROM schema_migrations ORDER BY version")
        versions = [row["version"] for row in cur.fetchall()]
        cur.execute("SELECT count(*) AS n FROM users")
        users = cur.fetchone()["n"]
    print(f"Migrations applied: {', '.join(versions) or 'none'}")
    print(f"Users in database: {users}")


if __name__ == "__main__":
    main()
