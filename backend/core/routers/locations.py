"""Location lookups for the create-ticket form. Any signed-in role."""

from typing import Any

from fastapi import APIRouter, Depends

from deps import IdPath, get_current_user
from schemas import BuildingResponse, FloorResponse, SeatResponse
from services import location_service

router = APIRouter(tags=["locations"], dependencies=[Depends(get_current_user)])


@router.get("/buildings", response_model=list[BuildingResponse])
def list_buildings() -> list[dict[str, Any]]:
    """List all buildings."""
    return location_service.list_buildings()


@router.get("/buildings/{building_id}/floors", response_model=list[FloorResponse])
def list_floors(building_id: IdPath) -> list[dict[str, Any]]:
    """List the floors in a building."""
    return location_service.list_floors(building_id)


@router.get("/floors/{floor_id}/seats", response_model=list[SeatResponse])
def list_seats(floor_id: IdPath) -> list[dict[str, Any]]:
    """List the seats on a floor."""
    return location_service.list_seats(floor_id)
