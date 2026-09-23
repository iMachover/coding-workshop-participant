"""Facility Admin routes. Admins only (403 for other roles), checked once for the whole router."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status

from deps import AdminUser, IdPath, require_role
from schemas import (
    AdminBuilding,
    AdminBuildingTree,
    AdminFloor,
    AdminSeat,
    AdminTicketDetail,
    AdminTicketFilters,
    AdminMetrics,
    AdminStatusChangeRequest,
    AdminTicketListItem,
    AdminUserResponse,
    AssignmentRequest,
    BuildingCreate,
    BuildingUpdate,
    EngineerWorkload,
    FloorCreate,
    FloorUpdate,
    NoteResponse,
    RoleChangeRequest,
    SeatCreate,
    SeatUpdate,
    StatusChangeResponse,
    UserFilters,
)
from services import admin_ticket_service, admin_user_service, facility_service

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



# --- facilities -------------------------------------------------------------------
# Deactivating hides a location from new tickets; existing tickets keep it. Delete is
# only for a location nothing has used yet (a typo): otherwise 409, deactivate instead.


@router.get("/facilities", response_model=list[AdminBuildingTree])
def get_facilities() -> list[dict[str, Any]]:
    """Every building, floor and seat, inactive ones too, each with its active (not closed) tickets."""
    return facility_service.get_tree()


@router.post("/buildings", status_code=status.HTTP_201_CREATED, response_model=AdminBuilding)
def create_building(body: BuildingCreate) -> dict[str, Any]:
    """Add a building. A name already used, ignoring case, returns 409."""
    return facility_service.create_building(body.building_name)


@router.patch("/buildings/{building_id}", response_model=AdminBuilding)
def update_building(building_id: IdPath, body: BuildingUpdate) -> dict[str, Any]:
    """Rename a building and/or (de)activate it. Its floors and seats are hidden while it's inactive."""
    return facility_service.update_building(building_id, body.building_name, body.is_active)


@router.delete("/buildings/{building_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_building(building_id: IdPath) -> None:
    """Delete a building with no tickets and no floors. Otherwise 409."""
    facility_service.delete_building(building_id)


@router.post(
    "/buildings/{building_id}/floors", status_code=status.HTTP_201_CREATED, response_model=AdminFloor
)
def create_floor(building_id: IdPath, body: FloorCreate) -> dict[str, Any]:
    """Add a floor to a building. A number the building already has returns 409."""
    return facility_service.create_floor(building_id, body.floor_number)


@router.patch("/floors/{floor_id}", response_model=AdminFloor)
def update_floor(floor_id: IdPath, body: FloorUpdate) -> dict[str, Any]:
    """Renumber a floor and/or (de)activate it. Its seats are hidden while it's inactive."""
    return facility_service.update_floor(floor_id, body.floor_number, body.is_active)


@router.delete("/floors/{floor_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_floor(floor_id: IdPath) -> None:
    """Delete a floor with no tickets and no seats. Otherwise 409."""
    facility_service.delete_floor(floor_id)


@router.post("/floors/{floor_id}/seats", status_code=status.HTTP_201_CREATED, response_model=AdminSeat)
def create_seat(floor_id: IdPath, body: SeatCreate) -> dict[str, Any]:
    """Add a seat to a floor. A number the floor already has, ignoring case, returns 409."""
    return facility_service.create_seat(floor_id, body.seat_number)


@router.patch("/seats/{seat_id}", response_model=AdminSeat)
def update_seat(seat_id: IdPath, body: SeatUpdate) -> dict[str, Any]:
    """Renumber a seat and/or (de)activate it."""
    return facility_service.update_seat(seat_id, body.seat_number, body.is_active)


@router.delete("/seats/{seat_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_seat(seat_id: IdPath) -> None:
    """Delete a seat no ticket has used. Otherwise 409."""
    facility_service.delete_seat(seat_id)
