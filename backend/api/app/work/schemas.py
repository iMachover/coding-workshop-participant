"""Request and response models for milestones, tasks and milestone notes."""

from datetime import date, datetime

from pydantic import BaseModel, Field

from app.overview.schemas import Progress


class MilestoneCreate(BaseModel):
    """Manager adds the next milestone to a project; the sequence is assigned."""

    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    start_date: date | None = None
    projected_end_date: date | None = None
    predicted_hours: float = Field(default=0, ge=0)


class TaskCreate(BaseModel):
    """Manager plans a task inside a milestone and assigns it to one employee."""

    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    predicted_hours: float = Field(default=0, ge=0)
    due_date: date | None = None
    assigned_to: int


class TaskStatusUpdate(BaseModel):
    """Employee moves their own task forward."""

    status: str = Field(pattern="^(in_progress|submitted)$")


class NoteCreate(BaseModel):
    """A note on a milestone's conversation."""

    note_text: str = Field(min_length=1, max_length=4000)


class TaskResource(BaseModel):
    """A physical item a task needs."""

    id: int
    name: str
    quantity: int
    estimated_cost: float
    actual_cost: float | None = None


class TaskDetail(BaseModel):
    """One task with its context, hours and cost. `display_status` adds Blocked / Queued."""

    id: int
    code: str
    title: str
    description: str | None = None
    status: str
    display_status: str
    due_date: date | None = None
    started_at: datetime | None = None
    submitted_at: datetime | None = None
    completed_at: datetime | None = None
    assignee_id: int
    assignee_name: str
    manager_id: int
    manager_name: str
    project_id: int
    project_code: str
    project_name: str
    milestone_id: int
    milestone_name: str
    milestone_locked: bool
    milestone_status: str
    planned_hours: float
    actual_hours: float
    planned_cost: float
    actual_cost: float
    resources: list[TaskResource]
    can_start: bool
    can_submit: bool
    can_review: bool
    blocked_reason: str | None = None


class Note(BaseModel):
    """One milestone note with its author."""

    id: int
    author_id: int
    author_name: str
    author_role: str
    note_text: str
    created_at: datetime


class MilestoneDetail(BaseModel):
    """A milestone with its tasks (scoped to the viewer), figures and notes."""

    id: int
    project_id: int
    project_code: str
    project_name: str
    manager_id: int
    sequence: int
    name: str
    description: str | None = None
    status: str
    locked: bool
    start_date: date | None = None
    projected_end_date: date | None = None
    completed_at: datetime | None = None
    predicted_hours: float
    planned_hours: float
    actual_hours: float
    planned_cost: float
    actual_cost: float
    progress: Progress
    tasks: list[TaskDetail]
    notes: list[Note]
    can_approve: bool
    approve_blocker: str | None = None
    assignable: list[dict] = []


class ProjectCloseResult(BaseModel):
    """Outcome of closing a project."""

    id: int
    code: str
    status: str
