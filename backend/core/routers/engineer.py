"""Engineer routes. Engineers only (403 for other roles); each acts on the caller's own queue."""

from typing import Annotated, Any

from fastapi import APIRouter, Query, status

from deps import EngineerUser, IdPath
from schemas import (
    AdminTicketDetail,
    AdminTicketListItem,
    EngineerTicketFilters,
    NoteCreate,
    NoteResponse,
    StatusChangeResponse,
)
from services import engineer_ticket_service

router = APIRouter(prefix="/engineer", tags=["engineer"])


@router.get("/tickets", response_model=list[AdminTicketListItem])
def list_my_queue(
    user: EngineerUser, filters: Annotated[EngineerTicketFilters, Query()]
) -> list[dict[str, Any]]:
    """The tickets assigned to the caller, P1 first then longest-waiting."""
    return engineer_ticket_service.list_my_queue(user["user_id"], filters)


@router.get("/tickets/{ticket_id}", response_model=AdminTicketDetail)
def get_ticket(ticket_id: IdPath, user: EngineerUser) -> dict[str, Any]:
    """Full details of one of the caller's tickets. Any other ticket returns 404."""
    return engineer_ticket_service.get_ticket(user["user_id"], ticket_id)


@router.get("/tickets/{ticket_id}/history", response_model=list[StatusChangeResponse])
def list_status_history(ticket_id: IdPath, user: EngineerUser) -> list[dict[str, Any]]:
    """Every status the ticket has been in and who changed it, oldest first."""
    return engineer_ticket_service.list_status_history(user["user_id"], ticket_id)


@router.get("/tickets/{ticket_id}/notes", response_model=list[NoteResponse])
def list_notes(ticket_id: IdPath, user: EngineerUser) -> list[dict[str, Any]]:
    """The ticket's notes from the employee and engineers, oldest first."""
    return engineer_ticket_service.list_notes(user["user_id"], ticket_id)


@router.post(
    "/tickets/{ticket_id}/notes", status_code=status.HTTP_201_CREATED, response_model=NoteResponse
)
def add_note(ticket_id: IdPath, body: NoteCreate, user: EngineerUser) -> dict[str, Any]:
    """Add a note to one of the caller's tickets. Closed tickets return 409."""
    return engineer_ticket_service.add_note(user["user_id"], ticket_id, body.note_text)
