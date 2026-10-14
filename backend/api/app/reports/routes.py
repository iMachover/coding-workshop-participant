"""HTTP route for the manager's Reports page."""

from typing import Any

import psycopg
from fastapi import APIRouter, Depends

from app.core.deps import require_roles
from app.db.connection import get_db
from app.reports import service
from app.reports.schemas import ManagerReports

router = APIRouter(tags=["reports"])


@router.get("/manager/reports", response_model=ManagerReports)
def read_manager_reports(
    manager: dict[str, Any] = Depends(require_roles("manager")),
    db: psycopg.Connection = Depends(get_db),
) -> ManagerReports:
    """Totals, hours by project, weekly labour cost (5 weeks), over-allocated people, planning note."""
    return service.manager_reports(db, manager)
