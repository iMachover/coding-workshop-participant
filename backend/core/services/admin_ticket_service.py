"""Facility Admin view of tickets: every ticket, whoever created it, with its priority,
and assigning tickets to engineers. Closing and admin notes come in later slices.
"""

from typing import Any

import psycopg

import db
from errors import BadRequestError, ConflictError, NotFoundError
from repositories import ticket_repository, user_repository
from schemas import AdminTicketFilters

# Finished tickets keep the engineer who did the work.
UNASSIGNABLE_STATUSES = {"resolved": "Resolved", "closed": "Closed"}


def _get_ticket(conn: psycopg.Connection, ticket_id: int) -> dict[str, Any]:
    """Return any ticket with its admin-only fields, or raise NotFoundError."""
    ticket = ticket_repository.get_admin_detail(conn, ticket_id)
    if ticket is None:
        raise NotFoundError("Ticket not found")
    return ticket


def list_tickets(filters: AdminTicketFilters) -> list[dict[str, Any]]:
    """Return all tickets matching the filters, highest priority and longest-waiting first."""
    closed = None if filters.view is None else filters.view == "closed"
    assigned = None if filters.assignment is None else filters.assignment == "assigned"
    with db.transaction() as conn:
        return ticket_repository.list_all(
            conn,
            status=filters.status,
            priority=filters.priority,
            urgency=filters.urgency,
            category=filters.category,
            building_id=filters.building_id,
            assigned=assigned,
            assigned_to=filters.assigned_to,
            escalated=filters.escalated,
            closed=closed,
            search=filters.q or None,
        )


def get_ticket(ticket_id: int) -> dict[str, Any]:
    """Return full details of any ticket."""
    with db.transaction() as conn:
        return _get_ticket(conn, ticket_id)


def list_notes(ticket_id: int) -> list[dict[str, Any]]:
    """Return every note on a ticket, from the employee and engineers alike, oldest first."""
    with db.transaction() as conn:
        _get_ticket(conn, ticket_id)
        return ticket_repository.list_notes(conn, ticket_id)


def list_status_history(ticket_id: int) -> list[dict[str, Any]]:
    """Return every status a ticket has been in, oldest first."""
    with db.transaction() as conn:
        _get_ticket(conn, ticket_id)
        return ticket_repository.list_status_history(conn, ticket_id)


def assign_ticket(ticket_id: int, engineer_id: int) -> dict[str, Any]:
    """Give an unfinished ticket to an engineer (or move it to another) and return it.

    The ticket row is locked, so two admins assigning at once can't interleave. Status
    is left alone: the engineer starts the work. Checks, in order: the ticket exists
    (404), isn't resolved or closed (409), the user is an engineer (400), and isn't
    already the assignee (409).
    """
    with db.transaction() as conn:
        ticket_repository.lock(conn, ticket_id)
        ticket = _get_ticket(conn, ticket_id)
        if ticket["status"] in UNASSIGNABLE_STATUSES:
            raise ConflictError(f"{UNASSIGNABLE_STATUSES[ticket['status']]} tickets can't be assigned")

        engineer = user_repository.get_by_id(conn, engineer_id)
        if engineer is None or engineer["role"] != "engineer":
            raise BadRequestError(f"User {engineer_id} is not an engineer")
        if ticket["assigned_to_user_id"] == engineer_id:
            raise ConflictError(f"This ticket is already assigned to {engineer['full_name']}")

        ticket_repository.assign(conn, ticket_id, engineer_id)
        return ticket_repository.get_admin_detail(conn, ticket_id)
