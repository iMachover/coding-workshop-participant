"""Facility Admin routes. Admins only (403 for other roles), checked once for the whole router."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from deps import IdPath, require_role
from schemas import (
    AdminTicketDetail,
    AdminTicketFilters,
    AdminTicketListItem,
    NoteResponse,
    StatusChangeResponse,
)
from services import admin_ticket_service

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
