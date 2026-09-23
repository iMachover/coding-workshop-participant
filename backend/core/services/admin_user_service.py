"""Facility Admin view of people: engineers and their workload. Managing roles comes in A3."""

from typing import Any

import db
from repositories import user_repository


def list_engineers() -> list[dict[str, Any]]:
    """Return every engineer with their active-ticket counts, lightest load first."""
    with db.transaction() as conn:
        return user_repository.list_engineers_with_workload(conn)
