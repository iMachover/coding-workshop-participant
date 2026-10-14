"""HTTP routes for departments. Every role lists them; admins create and rename."""

from typing import Any

import psycopg
from fastapi import APIRouter, Depends

from app.core.deps import CurrentUser, require_roles
from app.db.connection import get_db
from app.departments import service
from app.departments.schemas import Department, DepartmentCreate, DepartmentUpdate

router = APIRouter(tags=["departments"])

Admin = Depends(require_roles("admin"))


@router.get("/departments", response_model=list[Department])
def list_departments(_user: CurrentUser, db: psycopg.Connection = Depends(get_db)) -> list[Department]:
    """Every department with its people and active project counts."""
    return service.list_departments(db)


@router.post("/departments", response_model=Department, status_code=201)
def create_department(data: DepartmentCreate, admin: dict[str, Any] = Admin, db: psycopg.Connection = Depends(get_db)) -> Department:
    """Admin creates a department with a unique name and 3-letter prefix."""
    return service.create_department(db, admin, data)


@router.patch("/departments/{department_id}", response_model=Department)
def update_department(department_id: int, data: DepartmentUpdate, admin: dict[str, Any] = Admin, db: psycopg.Connection = Depends(get_db)) -> Department:
    """Admin renames a department or changes its prefix."""
    return service.update_department(db, admin, department_id, data)
