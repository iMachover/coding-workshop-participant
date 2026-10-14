"""HTTP routes for the signed-in user's profile, admin people management and a manager's direct reports."""

from typing import Any

import psycopg
from fastapi import APIRouter, Depends, Query, Response

from app.core.deps import CurrentUser, require_roles
from app.db.connection import get_db
from app.users import service
from app.users.schemas import PeopleSearch, UserCreate, UserDetail, UserFormOptions, UserPage, UserPublic, UserRow, UserUpdate

router = APIRouter(tags=["users"])


@router.get("/me", response_model=UserPublic)
def read_me(user: CurrentUser) -> UserPublic:
    """Return the profile of the user identified by the token."""
    return UserPublic(**user)


# --- Admin: People & access -------------------------------------------------------------------


@router.get("/users", response_model=UserPage)
def list_users(
    _admin: dict[str, Any] = Depends(require_roles("admin")),
    q: str | None = Query(default=None, max_length=100),
    role: str | None = Query(default=None, pattern="^(admin|manager|employee)$"),
    department_id: int | None = None,
    archived: bool = False,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=25, ge=1, le=100),
    db: psycopg.Connection = Depends(get_db),
) -> UserPage:
    """One page of people: search by name, email or code; filter by role, department or archived."""
    return service.list_users(db, query=q, role=role, department_id=department_id, archived=archived, page=page, limit=limit)


@router.get("/users/options", response_model=UserFormOptions)
def user_form_options(
    _admin: dict[str, Any] = Depends(require_roles("admin")),
    db: psycopg.Connection = Depends(get_db),
) -> UserFormOptions:
    """Managers and departments to choose from when creating or editing a person."""
    return service.form_options(db)


@router.get("/users/{user_id}", response_model=UserDetail)
def read_user(
    user_id: int,
    admin: dict[str, Any] = Depends(require_roles("admin")),
    db: psycopg.Connection = Depends(get_db),
) -> UserDetail:
    """One person's profile: projects, teams, hours, cost and what blocks archiving them."""
    return service.get_user(db, admin, user_id)


@router.post("/users", response_model=UserDetail, status_code=201)
def create_user(
    data: UserCreate,
    admin: dict[str, Any] = Depends(require_roles("admin")),
    db: psycopg.Connection = Depends(get_db),
) -> UserDetail:
    """Admin creates an account. The generated username comes back in the profile; show it once."""
    return service.create_user(db, admin, data)


@router.patch("/users/{user_id}", response_model=UserDetail)
def update_user(
    user_id: int,
    data: UserUpdate,
    admin: dict[str, Any] = Depends(require_roles("admin")),
    db: psycopg.Connection = Depends(get_db),
) -> UserDetail:
    """Admin changes any field but the username. 409 when a role change is blocked."""
    return service.update_user(db, admin, user_id, data)


@router.post("/users/{user_id}/archive", response_model=UserDetail)
def archive_user(
    user_id: int,
    admin: dict[str, Any] = Depends(require_roles("admin")),
    db: psycopg.Connection = Depends(get_db),
) -> UserDetail:
    """Admin archives a person; their login stops at once. 409 with the blockers if any."""
    return service.set_archived(db, admin, user_id, True)


@router.post("/users/{user_id}/restore", response_model=UserDetail)
def restore_user(
    user_id: int,
    admin: dict[str, Any] = Depends(require_roles("admin")),
    db: psycopg.Connection = Depends(get_db),
) -> UserDetail:
    """Admin returns an archived person to active use."""
    return service.set_archived(db, admin, user_id, False)


# --- Manager: My team -------------------------------------------------------------------------


@router.get("/employees", response_model=list[UserRow])
def list_employees(
    manager: dict[str, Any] = Depends(require_roles("manager")),
    q: str | None = Query(default=None, max_length=100),
    db: psycopg.Connection = Depends(get_db),
) -> list[UserRow]:
    """The manager's direct reports with hours this week, teams and task progress."""
    return service.list_direct_reports(db, manager, query=q)


@router.get("/employees/search", response_model=PeopleSearch)
def search_employees(
    manager: dict[str, Any] = Depends(require_roles("manager")),
    q: str | None = Query(default=None, max_length=100),
    job_title: str | None = Query(default=None, max_length=100),
    exclude_team_id: int | None = None,
    db: psycopg.Connection = Depends(get_db),
) -> PeopleSearch:
    """People picker: first 25 of the manager's own and unassigned employees by name, title filter, minus a team's members."""
    return service.search_pickable(db, manager, query=q, job_title=job_title, exclude_team_id=exclude_team_id)


@router.get("/employees/{user_id}", response_model=UserDetail)
def read_employee(
    user_id: int,
    manager: dict[str, Any] = Depends(require_roles("manager")),
    db: psycopg.Connection = Depends(get_db),
) -> UserDetail:
    """A direct report's profile; 404 for anyone else."""
    return service.get_user(db, manager, user_id)


@router.patch("/employees/{user_id}", response_model=UserDetail)
def update_employee(
    user_id: int,
    data: UserUpdate,
    manager: dict[str, Any] = Depends(require_roles("manager")),
    db: psycopg.Connection = Depends(get_db),
) -> UserDetail:
    """Manager changes a direct report's first name, last name or email; nothing else (403)."""
    return service.update_user(db, manager, user_id, data)


@router.post("/employees/{user_id}/assign", response_model=UserDetail)
def assign_employee(
    user_id: int,
    manager: dict[str, Any] = Depends(require_roles("manager")),
    db: psycopg.Connection = Depends(get_db),
) -> UserDetail:
    """Manager takes an unassigned employee on as a direct report. 400 if they report to someone else, 409 if already theirs."""
    return service.assign_report(db, manager, user_id)


@router.post("/employees/{user_id}/release", status_code=204)
def release_employee(
    user_id: int,
    manager: dict[str, Any] = Depends(require_roles("manager")),
    db: psycopg.Connection = Depends(get_db),
) -> Response:
    """Manager releases a direct report to the unassigned pool and off their teams. 409 while they have open tasks."""
    service.release_report(db, manager, user_id)
    return Response(status_code=204)
