"""HTTP routes for projects. Role scoping lives in the service."""

from typing import Any

import psycopg
from fastapi import APIRouter, Depends, Query

from app.core.deps import CurrentUser, require_roles
from app.db.connection import get_db
from app.projects import service
from app.projects.schemas import DepartmentOption, ManagerOption, ProjectCreate, ProjectDetail, ProjectRow, ProjectUpdate
from pydantic import BaseModel

router = APIRouter(tags=["projects"])


class FormOptions(BaseModel):
    """Choices for the admin's project form."""

    managers: list[ManagerOption]
    departments: list[DepartmentOption]


@router.get("/projects", response_model=list[ProjectRow])
def list_projects(
    user: CurrentUser,
    q: str | None = Query(default=None, max_length=100),
    archived: bool = False,
    db: psycopg.Connection = Depends(get_db),
) -> list[ProjectRow]:
    """Projects the signed-in user may see: all (admin), managed (manager) or joined (employee)."""
    return service.list_projects(db, user, query=q, archived=archived)


@router.get("/me/projects", response_model=list[ProjectRow])
def list_my_projects(
    user: CurrentUser,
    q: str | None = Query(default=None, max_length=100),
    db: psycopg.Connection = Depends(get_db),
) -> list[ProjectRow]:
    """EMPLOYEE.md §7 alias of GET /projects for the signed-in user."""
    return service.list_projects(db, user, query=q)


@router.get("/projects/options", response_model=FormOptions)
def project_form_options(
    _admin: dict[str, Any] = Depends(require_roles("admin")),
    db: psycopg.Connection = Depends(get_db),
) -> FormOptions:
    """Managers and departments to choose from when creating or editing a project."""
    return FormOptions(**service.form_options(db))


@router.get("/projects/{project_id}", response_model=ProjectDetail)
def read_project(
    project_id: int,
    user: CurrentUser,
    db: psycopg.Connection = Depends(get_db),
) -> ProjectDetail:
    """One project with its milestone sequence; 404 outside the user's scope."""
    return service.get_project(db, user, project_id)


@router.post("/projects", response_model=ProjectDetail, status_code=201)
def create_project(
    data: ProjectCreate,
    admin: dict[str, Any] = Depends(require_roles("admin")),
    db: psycopg.Connection = Depends(get_db),
) -> ProjectDetail:
    """Admin creates a project with one accountable manager."""
    return service.create_project(db, admin, data)


@router.patch("/projects/{project_id}", response_model=ProjectDetail)
def update_project(
    project_id: int,
    data: ProjectUpdate,
    user: CurrentUser,
    db: psycopg.Connection = Depends(get_db),
) -> ProjectDetail:
    """Admin: any field incl. manager. Manager: name, description, dates, budget of own projects."""
    return service.update_project(db, user, project_id, data)


@router.post("/projects/{project_id}/archive", response_model=ProjectDetail)
def archive_project(
    project_id: int,
    admin: dict[str, Any] = Depends(require_roles("admin")),
    db: psycopg.Connection = Depends(get_db),
) -> ProjectDetail:
    """Admin archives a project; it leaves every list but keeps its history."""
    return service.set_archived(db, admin, project_id, True)


@router.post("/projects/{project_id}/restore", response_model=ProjectDetail)
def restore_project(
    project_id: int,
    admin: dict[str, Any] = Depends(require_roles("admin")),
    db: psycopg.Connection = Depends(get_db),
) -> ProjectDetail:
    """Admin returns an archived project to active use."""
    return service.set_archived(db, admin, project_id, False)
