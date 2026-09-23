"""Facility Admin routes. Admins only (403 for other roles), checked once for the whole router."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from deps import AdminUser, IdPath, require_role
from schemas import (
    AdminTicketDetail,
    AdminTicketFilters,
    AdminMetrics,
    AdminStatusChangeRequest,
    AdminTicketListItem,
    AdminUserResponse,
    AssignmentRequest,
    EngineerWorkload,
    NoteResponse,
    RoleChangeRequest,
    StatusChangeResponse,
    UserFilters,
)
from services import admin_ticket_service, admin_user_service

router = APIRouter(
    prefix="/admin", tags=["admin"], dependencies=[Depends(require_role("admin"))]
)


@router.get("/tickets", response_model=list[AdminTicketListItem])
def list_tickets(filters: Annotated[AdminTicketFilters, Query()]) -> list[dict[str, Any]]:
    """List every ticket, P1 first then longest-waiting. `assignment=unassigned` shows the triage queue."""
    return admin_ticket_service.list_tickets(filters)


@router.get("/tickets/{ticket_id}", response_model=AdminTicketDetail)
def get_ticket(ticket_id: IdPath) -> dict[str, Any]:
    """Full details of any ticket, including its priority and the requester's contact details."""
    return admin_ticket_service.get_ticket(ticket_id)


@router.get("/tickets/{ticket_id}/notes", response_model=list[NoteResponse])
def list_notes(ticket_id: IdPath) -> list[dict[str, Any]]:
    """Every note on the ticket, oldest first. Read-only for admins."""
    return admin_ticket_service.list_notes(ticket_id)


@router.get("/tickets/{ticket_id}/history", response_model=list[StatusChangeResponse])
def list_status_history(ticket_id: IdPath) -> list[dict[str, Any]]:
    """Every status the ticket has been in and who changed it, oldest first."""
    return admin_ticket_service.list_status_history(ticket_id)


@router.put("/tickets/{ticket_id}/assignment", response_model=AdminTicketDetail)
def assign_ticket(ticket_id: IdPath, body: AssignmentRequest) -> dict[str, Any]:
    """Assign or reassign the ticket to an engineer. Returns the updated ticket.

    The first assignment also marks it acknowledged. Resolved or closed tickets, and the
    engineer it already has, return 409; a user who isn't an engineer returns 400.
    """
    return admin_ticket_service.assign_ticket(ticket_id, body.engineer_id)


@router.post("/tickets/{ticket_id}/status", response_model=AdminTicketDetail)
def finish_resolved(ticket_id: IdPath, body: AdminStatusChangeRequest, user: AdminUser) -> dict[str, Any]:
    """Close a resolved ticket (optional note), or send it back to its engineer (reason required).

    Anything but a resolved ticket returns 409. Returns the updated ticket.
    """
    return admin_ticket_service.finish_resolved(user["user_id"], ticket_id, body.status, body.reason)


@router.get("/metrics", response_model=AdminMetrics)
def get_metrics() -> dict[str, Any]:
    """Headline counts for the dashboard: unassigned, by status, active P1s, escalations, recent closes."""
    return admin_ticket_service.get_metrics()


@router.get("/engineers", response_model=list[EngineerWorkload])
def list_engineers() -> list[dict[str, Any]]:
    """Every engineer with their active tickets (open, in progress, blocked), lightest load first."""
    return admin_user_service.list_engineers()


@router.get("/users", response_model=list[AdminUserResponse])
def list_users(filters: Annotated[UserFilters, Query()]) -> list[dict[str, Any]]:
    """Everyone, by name, with their role and active tickets. Filter by role; search name or email."""
    return admin_user_service.list_users(filters)


@router.put("/users/{user_id}/role", response_model=AdminUserResponse)
def change_role(user_id: IdPath, body: RoleChangeRequest) -> dict[str, Any]:
    """Move someone between employee and engineer. Returns them updated; they'll need to sign in again.

    Admin accounts return 403. The role they already have, or an engineer who still has
    active tickets, returns 409.
    """
    return admin_user_service.change_role(user_id, body.role)

