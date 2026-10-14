"""HTTP routes for time entries. Rules live in the service."""

from datetime import date
from typing import Any

import psycopg
from fastapi import APIRouter, Depends, Query, Response

from app.core.deps import CurrentUser, require_roles
from app.db.connection import get_db
from app.hours import service
from app.hours.schemas import Ledger, TimeEntry, TimeEntryCreate, TimeEntryUpdate

router = APIRouter(tags=["hours"])

Employee = Depends(require_roles("employee"))


@router.get("/me/time-entries", response_model=Ledger)
def my_ledger(
    employee: dict[str, Any] = Employee,
    start: date | None = Query(default=None, alias="from"),
    end: date | None = Query(default=None, alias="to"),
    db: psycopg.Connection = Depends(get_db),
) -> Ledger:
    """My entries for a date range (default: this week, Monday to Sunday) with the week's totals."""
    return service.ledger(db, employee, start, end)


@router.get("/tasks/{task_id}/time-entries", response_model=list[TimeEntry])
def task_entries(task_id: int, user: CurrentUser, db: psycopg.Connection = Depends(get_db)) -> list[TimeEntry]:
    """Entries on a task: the employee's own, all of them for the project's manager or an admin."""
    return service.task_entries(db, user, task_id)


@router.post("/tasks/{task_id}/time-entries", response_model=TimeEntry, status_code=201)
def log_hours(task_id: int, data: TimeEntryCreate, employee: dict[str, Any] = Employee, db: psycopg.Connection = Depends(get_db)) -> TimeEntry:
    """Log hours on one of my tasks for one day."""
    return service.log_hours(db, employee, task_id, data)


@router.patch("/time-entries/{entry_id}", response_model=TimeEntry)
def correct_entry(entry_id: int, data: TimeEntryUpdate, employee: dict[str, Any] = Employee, db: psycopg.Connection = Depends(get_db)) -> TimeEntry:
    """Correct the date, hours or note of my entry while its task is not completed."""
    return service.correct_entry(db, employee, entry_id, data)


@router.delete("/time-entries/{entry_id}", status_code=204)
def delete_entry(entry_id: int, employee: dict[str, Any] = Employee, db: psycopg.Connection = Depends(get_db)) -> Response:
    """Remove my entry while its task is not completed."""
    service.delete_entry(db, employee, entry_id)
    return Response(status_code=204)
