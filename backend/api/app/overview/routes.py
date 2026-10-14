"""HTTP routes for each role's Overview page. One call fills the whole page."""

from typing import Any

import psycopg
from fastapi import APIRouter, Depends

from app.core.deps import require_roles
from app.db.connection import get_db
from app.overview import service
from app.overview.schemas import AdminOverview, EmployeeOverview, ManagerOverview

router = APIRouter(tags=["overview"])


@router.get("/me/overview", response_model=EmployeeOverview)
def read_employee_overview(
    user: dict[str, Any] = Depends(require_roles("employee")),
    db: psycopg.Connection = Depends(get_db),
) -> EmployeeOverview:
    """The signed-in employee's own work: stat cards, active milestone, open tasks, hours."""
    return service.employee_overview(db, user)


@router.get("/manager/overview", response_model=ManagerOverview)
def read_manager_overview(
    project_id: int | None = None,
    user: dict[str, Any] = Depends(require_roles("manager")),
    db: psycopg.Connection = Depends(get_db),
) -> ManagerOverview:
    """The manager's projects; `project_id` picks the project in focus (default: the first)."""
    return service.manager_overview(db, user, project_id)


@router.get("/admin/overview", response_model=AdminOverview)
def read_admin_overview(
    _admin: dict[str, Any] = Depends(require_roles("admin")),
    db: psycopg.Connection = Depends(get_db),
) -> AdminOverview:
    """Organization-wide portfolio, manager coverage and the latest audit activity."""
    return service.admin_overview(db)
