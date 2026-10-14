"""Request and response models for time entries (EMPLOYEE.md §2 "Hours are logged, not timed")."""

from datetime import date

from pydantic import BaseModel, Field

from app.overview.schemas import Week

MAX_HOURS_PER_ENTRY = 24


class TimeEntryCreate(BaseModel):
    """Log hours on one of my tasks for one day, after the work."""

    work_date: date
    hours: float = Field(gt=0, le=MAX_HOURS_PER_ENTRY)
    note: str | None = Field(default=None, max_length=500)


class TimeEntryUpdate(BaseModel):
    """Correct one of my entries while its task is not completed."""

    work_date: date | None = None
    hours: float | None = Field(default=None, gt=0, le=MAX_HOURS_PER_ENTRY)
    note: str | None = Field(default=None, max_length=500)


class TimeEntry(BaseModel):
    """One logged entry with its task and project, and whether the viewer may still change it."""

    id: int
    work_date: date
    hours: float
    cost: float
    note: str | None = None
    user_id: int
    user_name: str
    task_id: int
    task_code: str
    task_title: str
    task_status: str
    project_id: int
    project_code: str
    project_name: str
    editable: bool


class LoggableTask(BaseModel):
    """A task the employee may log hours on: theirs, in progress or submitted, on a live project."""

    id: int
    code: str
    title: str
    status: str
    project_code: str
    project_name: str


class Ledger(BaseModel):
    """GET /me/time-entries: the employee's entries for a date range plus the week's totals."""

    week: Week
    range_start: date
    range_end: date
    entries: list[TimeEntry]
    range_hours: float
    range_cost: float
    hours_this_week: float
    cost_this_week: float
    available_hours: float
    hourly_rate: float
    lifetime_hours: float
    lifetime_cost: float
    loggable_tasks: list[LoggableTask]
