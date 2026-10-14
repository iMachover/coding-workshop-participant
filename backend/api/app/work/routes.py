"""HTTP routes for the task and milestone workflow. Rules live in the service."""

import psycopg
from fastapi import APIRouter, Depends

from app.core.deps import CurrentUser
from app.db.connection import get_db
from app.work import service
from app.work.schemas import (
    MilestoneCreate,
    MilestoneDetail,
    NoteCreate,
    ProjectCloseResult,
    TaskCreate,
    TaskDetail,
    TaskStatusUpdate,
)

router = APIRouter(tags=["work"])


@router.get("/tasks/{task_id}", response_model=TaskDetail)
def read_task(task_id: int, user: CurrentUser, db: psycopg.Connection = Depends(get_db)) -> TaskDetail:
    """One task with its figures and what the signed-in user may do with it."""
    return service.get_task(db, user, task_id)


@router.patch("/tasks/{task_id}", response_model=TaskDetail)
def update_task_status(task_id: int, data: TaskStatusUpdate, user: CurrentUser, db: psycopg.Connection = Depends(get_db)) -> TaskDetail:
    """Employee starts (in_progress) or submits (submitted) their own task. Forward only."""
    return service.update_task_status(db, user, task_id, data.status)


@router.post("/tasks/{task_id}/complete", response_model=TaskDetail)
def complete_task(task_id: int, user: CurrentUser, db: psycopg.Connection = Depends(get_db)) -> TaskDetail:
    """Manager approves a submitted task."""
    return service.review_task(db, user, task_id, "complete")


@router.post("/tasks/{task_id}/reopen", response_model=TaskDetail)
def reopen_task(task_id: int, user: CurrentUser, db: psycopg.Connection = Depends(get_db)) -> TaskDetail:
    """Manager returns a submitted or completed task to in progress."""
    return service.review_task(db, user, task_id, "reopen")


@router.get("/milestones/{milestone_id}", response_model=MilestoneDetail)
def read_milestone(milestone_id: int, user: CurrentUser, db: psycopg.Connection = Depends(get_db)) -> MilestoneDetail:
    """A milestone with its tasks (employees: own only), figures, notes and approval state."""
    return service.get_milestone(db, user, milestone_id)


@router.post("/projects/{project_id}/milestones", response_model=MilestoneDetail, status_code=201)
def create_milestone(project_id: int, data: MilestoneCreate, user: CurrentUser, db: psycopg.Connection = Depends(get_db)) -> MilestoneDetail:
    """Manager appends the next milestone to their project."""
    return service.create_milestone(db, user, project_id, data)


@router.post("/milestones/{milestone_id}/tasks", response_model=TaskDetail, status_code=201)
def create_task(milestone_id: int, data: TaskCreate, user: CurrentUser, db: psycopg.Connection = Depends(get_db)) -> TaskDetail:
    """Manager plans a task in a milestone for someone on the project."""
    return service.create_task(db, user, milestone_id, data)


@router.post("/milestones/{milestone_id}/approve", response_model=MilestoneDetail)
def approve_milestone(milestone_id: int, user: CurrentUser, db: psycopg.Connection = Depends(get_db)) -> MilestoneDetail:
    """Manager approves a milestone once every task in it is completed."""
    return service.approve_milestone(db, user, milestone_id)


@router.post("/milestones/{milestone_id}/notes", response_model=MilestoneDetail, status_code=201)
def add_note(milestone_id: int, data: NoteCreate, user: CurrentUser, db: psycopg.Connection = Depends(get_db)) -> MilestoneDetail:
    """Add a note to the milestone conversation."""
    return service.add_note(db, user, milestone_id, data)


@router.post("/projects/{project_id}/close", response_model=ProjectCloseResult)
def close_project(project_id: int, user: CurrentUser, db: psycopg.Connection = Depends(get_db)) -> ProjectCloseResult:
    """Manager closes a project once every milestone is approved."""
    return service.close_project(db, user, project_id)
