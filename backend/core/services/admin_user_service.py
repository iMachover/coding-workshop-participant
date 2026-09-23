"""Facility Admin view of people: everyone's role and load, engineers' workload, and
moving people between the employee and engineer roles.

Admin accounts are set up outside the app: they're listed but can't be changed here,
and no one can be made an admin. A role change signs that person out, because their
token no longer matches their role (see auth_service.user_from_token).
"""

from typing import Any

import db
from errors import ConflictError, ForbiddenError, NotFoundError
from repositories import user_repository
from schemas import UserFilters


def list_engineers() -> list[dict[str, Any]]:
    """Return every engineer with their active-ticket counts, lightest load first."""
    with db.transaction() as conn:
        return user_repository.list_engineers_with_workload(conn)


def list_users(filters: UserFilters) -> list[dict[str, Any]]:
    """Return users matching the filters, by name, each with their active-ticket count."""
    with db.transaction() as conn:
        return user_repository.list_with_active_counts(
            conn, role=filters.role, search=filters.q or None
        )


def change_role(user_id: int, role: str) -> dict[str, Any]:
    """Move someone between employee and engineer, and return them updated.

    The user row is locked, so a ticket can't be assigned to an engineer while they're
    being demoted. Checks, in order: the user exists (404), isn't an admin (403), doesn't
    already have the role (409), and, when leaving engineer, has no active tickets (409).
    """
    with db.transaction() as conn:
        user_repository.lock(conn, user_id)
        found = user_repository.list_with_active_counts(conn, user_id=user_id)
        if not found:
            raise NotFoundError("User not found")
        user = found[0]
        if user["role"] == "admin":
            raise ForbiddenError("Admin accounts can't be changed here")
        if user["role"] == role:
            raise ConflictError(f"{user['full_name']} is already an {role}")
        count = user["active_ticket_count"]
        if user["role"] == "engineer" and count:
            tickets = "ticket" if count == 1 else "tickets"
            raise ConflictError(
                f"{user['full_name']} still has {count} active {tickets}. Reassign them first."
            )

        user_repository.set_role(conn, user_id, role)
        return user_repository.list_with_active_counts(conn, user_id=user_id)[0]
