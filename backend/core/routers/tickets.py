"""Employee ticket routes. Every route acts on behalf of the X-User-Id caller."""

from typing import Annotated, Any

from fastapi import APIRouter, Query, status

from deps import CurrentUser, IdPath
from schemas import (
    TicketCreate,
    TicketDetail,
    TicketFilters,
    TicketListItem,
    TicketResponse,
)
from services import ticket_service

router = APIRouter(prefix="/tickets", tags=["tickets"])


@router.get("", response_model=list[TicketListItem])
def list_my_tickets(
    user: CurrentUser, filters: Annotated[TicketFilters, Query()]
) -> list[dict[str, Any]]:
    """List the caller's tickets. Filter by status, urgency, priority, view and search text."""
    return ticket_service.list_my_tickets(user["user_id"], filters)


@router.post("", status_code=status.HTTP_201_CREATED, response_model=TicketResponse)
def create_ticket(body: TicketCreate, user: CurrentUser) -> dict[str, Any]:
    """Create a ticket for the caller. Priority comes from the affected scope."""
    return ticket_service.create_ticket(user["user_id"], body)


@router.get("/{ticket_id}", response_model=TicketDetail)
def get_my_ticket(ticket_id: IdPath, user: CurrentUser) -> dict[str, Any]:
    """Full details of one of the caller's tickets. Others' tickets return 404."""
    return ticket_service.get_my_ticket(user["user_id"], ticket_id)
