"""
Task and milestone workflow (EMPLOYEE.md §2, MANAGER.md §2).

Employees move their own tasks forward only: assigned -> in_progress -> submitted. Starting
a task is refused while its milestone is locked (an earlier milestone is not completed) or
while another milestone holds the employee's in-progress work. Managers complete or reopen
submitted tasks, add milestones in sequence, plan tasks, approve a milestone once every task
in it is completed, and close a project once every milestone is completed. Everyone on the
project reads and adds milestone notes. Every write records an audit row.
"""

from typing import Any

import psycopg

from app.core import audit
from app.core.errors import AppError
from app.overview.service import progress
from app.work import repository as repo
from app.work.schemas import (
    MilestoneCreate,
    MilestoneDetail,
    Note,
    NoteCreate,
    ProjectCloseResult,
    TaskCreate,
    TaskDetail,
    TaskResource,
)


def _money(value: float) -> float:
    return round(value, 2)


def _conflict(message: str) -> AppError:
    return AppError(409, "CONFLICT", message)


def _not_found(what: str) -> AppError:
    return AppError(404, "NOT_FOUND", f"{what} not found")


# --- Access -----------------------------------------------------------------------------------


def _can_view_project(conn: psycopg.Connection, user: dict[str, Any], project: dict[str, Any]) -> bool:
    if project["is_archived"] and user["role"] != "admin":
        return False
    if user["role"] == "admin":
        return True
    if user["role"] == "manager":
        return project["manager_id"] == user["id"]
    return repo.is_on_project(conn, user["id"], project["id"])


def _require_manager_of(user: dict[str, Any], row: dict[str, Any]) -> None:
    """403 unless the user manages the project the row belongs to (and it is open)."""
    if user["role"] != "manager" or row["manager_id"] != user["id"]:
        raise AppError(403, "FORBIDDEN", "Only the project's manager can do this")
    if row["is_archived"] or row["project_status"] != "active":
        raise _conflict("This project is closed or archived")


# --- Tasks ------------------------------------------------------------------------------------


def _display_status(task: dict[str, Any], active: dict[str, Any] | None) -> str:
    if task["status"] != "assigned":
        return task["status"]
    if task["milestone_locked"]:
        return "blocked"
    if active is not None and active["id"] != task["milestone_id"]:
        return "queued"
    return "assigned"


def _blocked_reason(task: dict[str, Any], active: dict[str, Any] | None) -> str | None:
    if task["status"] != "assigned":
        return None
    if task["milestone_locked"]:
        return "Blocked: the milestone before this one must be completed and approved first."
    if active is not None and active["id"] != task["milestone_id"]:
        return f"Queued: your active milestone is {active['name']} ({active['project_code']}). Submit that work before starting this task."
    return None


def _task_detail(conn: psycopg.Connection, user: dict[str, Any], row: dict[str, Any], active: dict[str, Any] | None) -> TaskDetail:
    mine = row["assignee_id"] == user["id"]
    manages = user["role"] == "manager" and row["manager_id"] == user["id"]
    open_project = not row["is_archived"] and row["project_status"] == "active"
    reason = _blocked_reason(row, active)
    return TaskDetail(
        id=row["id"],
        code=row["code"],
        title=row["title"],
        description=row["description"],
        status=row["status"],
        display_status=_display_status(row, active),
        due_date=row["due_date"],
        started_at=row["started_at"],
        submitted_at=row["submitted_at"],
        completed_at=row["completed_at"],
        assignee_id=row["assignee_id"],
        assignee_name=row["assignee_name"],
        manager_id=row["manager_id"],
        manager_name=row["manager_name"],
        project_id=row["project_id"],
        project_code=row["project_code"],
        project_name=row["project_name"],
        milestone_id=row["milestone_id"],
        milestone_name=row["milestone_name"],
        milestone_locked=row["milestone_locked"],
        milestone_status=row["milestone_status"],
        planned_hours=row["planned_hours"],
        actual_hours=row["actual_hours"],
        planned_cost=_money(row["planned_hours"] * row["assignee_rate"] + row["planned_resources"]),
        actual_cost=_money(row["actual_labour"] + row["actual_resources"]),
        resources=[TaskResource(**r) for r in repo.task_resources(conn, row["id"])],
        can_start=mine and open_project and row["status"] == "assigned" and reason is None,
        can_submit=mine and open_project and row["status"] == "in_progress",
        can_review=manages and open_project and row["status"] in ("submitted", "completed") and row["milestone_status"] != "completed",
        blocked_reason=reason,
    )


def _load_task(conn: psycopg.Connection, user: dict[str, Any], task_id: int) -> dict[str, Any]:
    row = repo.task(conn, task_id)
    if row is None or not _can_view_project(conn, user, {"id": row["project_id"], "manager_id": row["manager_id"], "is_archived": row["is_archived"]}):
        raise _not_found("Task")
    if user["role"] == "employee" and row["assignee_id"] != user["id"]:
        raise _not_found("Task")
    return row


def get_task(conn: psycopg.Connection, user: dict[str, Any], task_id: int) -> TaskDetail:
    """One task; employees see only their own, managers their projects', admins all."""
    row = _load_task(conn, user, task_id)
    active = repo.active_milestone_of(conn, row["assignee_id"])
    return _task_detail(conn, user, row, active)


def update_task_status(conn: psycopg.Connection, user: dict[str, Any], task_id: int, status: str) -> TaskDetail:
    """Employee starts or submits their own task. Forward only, one active milestone."""
    if user["role"] != "employee":
        raise AppError(403, "FORBIDDEN", "Only the assigned employee moves a task forward")
    row = _load_task(conn, user, task_id)
    if row["is_archived"] or row["project_status"] != "active":
        raise _conflict("This project is closed or archived")
    active = repo.active_milestone_of(conn, user["id"])

    if status == "in_progress":
        if row["status"] != "assigned":
            raise _conflict(f"Task is already {row['status'].replace('_', ' ')}")
        if row["milestone_locked"]:
            raise _conflict("This milestone is locked until the one before it is approved")
        if active is not None and active["id"] != row["milestone_id"]:
            raise _conflict(f"You already have work in progress in {active['name']} ({active['project_code']}). Submit it before starting another milestone.")
        repo.set_task_status(conn, task_id, "in_progress", {"started_at": repo.now()})
        if row["milestone_status"] == "not_started":
            repo.set_milestone_status(conn, row["milestone_id"], "in_progress")
        action, summary = "started", f"Started task {row['title']}"
    else:
        if row["status"] != "in_progress":
            raise _conflict("Only a task in progress can be submitted" if row["status"] == "assigned" else f"Task is already {row['status']}")
        repo.set_task_status(conn, task_id, "submitted", {"submitted_at": repo.now()})
        action, summary = "submitted", f"Submitted task {row['title']} for review"

    audit.record(
        conn, actor_id=user["id"], action=action, entity_type="task", entity_id=task_id, entity_code=row["code"],
        summary=summary, details={"before": {"status": row["status"]}, "after": {"status": status}},
    )
    return get_task(conn, user, task_id)


def review_task(conn: psycopg.Connection, user: dict[str, Any], task_id: int, decision: str) -> TaskDetail:
    """Manager completes a submitted task, or reopens a submitted / completed one."""
    row = repo.task(conn, task_id)
    if row is None:
        raise _not_found("Task")
    _require_manager_of(user, row)
    if row["milestone_status"] == "completed":
        raise _conflict("This milestone is already approved; its tasks cannot change")

    if decision == "complete":
        if row["status"] != "submitted":
            raise _conflict("Only a submitted task can be marked completed")
        repo.set_task_status(conn, task_id, "completed", {"completed_at": repo.now()})
        action, summary = "completed", f"Approved task {row['title']}"
    else:
        if row["status"] not in ("submitted", "completed"):
            raise _conflict("Only a submitted or completed task can be reopened")
        repo.set_task_status(conn, task_id, "in_progress", {"submitted_at": None, "completed_at": None})
        action, summary = "reopened", f"Reopened task {row['title']}"

    audit.record(
        conn, actor_id=user["id"], action=action, entity_type="task", entity_id=task_id, entity_code=row["code"],
        summary=summary, details={"before": {"status": row["status"]}, "after": {"status": "completed" if decision == "complete" else "in_progress"}},
    )
    return get_task(conn, user, task_id)


def create_task(conn: psycopg.Connection, user: dict[str, Any], milestone_id: int, data: TaskCreate) -> TaskDetail:
    """Manager plans a task in one of their milestones for someone on the project."""
    ms = repo.milestone(conn, milestone_id)
    if ms is None:
        raise _not_found("Milestone")
    _require_manager_of(user, ms)
    if ms["status"] == "completed":
        raise _conflict("This milestone is already approved")
    people = {p["id"] for p in repo.assignable_people(conn, ms["project_id"])}
    if data.assigned_to not in people:
        raise AppError(400, "VALIDATION_ERROR", "Request validation failed", {"assigned_to": "Choose someone on a team attached to this project"})
    created = repo.insert_task(conn, milestone_id, data.model_dump())
    audit.record(
        conn, actor_id=user["id"], action="created", entity_type="task", entity_id=created["id"], entity_code=created["code"],
        summary=f"Created task {data.title} in {ms['name']}", details={"after": data.model_dump(mode="json")},
    )
    return get_task(conn, user, created["id"])


# --- Milestones -------------------------------------------------------------------------------


def _approve_blocker(ms: dict[str, Any]) -> str | None:
    if ms["status"] == "completed":
        return "Already approved"
    if ms["locked"]:
        return "The milestone before this one must be approved first"
    if ms["tasks_total"] == 0:
        return "Add at least one task before approving"
    if ms["tasks_completed"] < ms["tasks_total"]:
        return f"{ms['tasks_total'] - ms['tasks_completed']} of {ms['tasks_total']} tasks are not completed yet"
    return None


def get_milestone(conn: psycopg.Connection, user: dict[str, Any], milestone_id: int) -> MilestoneDetail:
    """A milestone with its tasks (employee: own only), figures, notes and approval state."""
    ms = repo.milestone(conn, milestone_id)
    if ms is None or not _can_view_project(conn, user, {"id": ms["project_id"], "manager_id": ms["manager_id"], "is_archived": ms["is_archived"]}):
        raise _not_found("Milestone")
    rows = repo.milestone_tasks(conn, milestone_id, user["id"] if user["role"] == "employee" else None)
    active_by_user: dict[int, dict[str, Any] | None] = {}
    tasks = []
    for row in rows:
        if row["assignee_id"] not in active_by_user:
            active_by_user[row["assignee_id"]] = repo.active_milestone_of(conn, row["assignee_id"])
        tasks.append(_task_detail(conn, user, row, active_by_user[row["assignee_id"]]))
    manages = user["role"] == "manager" and ms["manager_id"] == user["id"] and ms["project_status"] == "active"
    blocker = _approve_blocker(ms)
    return MilestoneDetail(
        id=ms["id"],
        project_id=ms["project_id"],
        project_code=ms["project_code"],
        project_name=ms["project_name"],
        manager_id=ms["manager_id"],
        sequence=ms["sequence"],
        name=ms["name"],
        description=ms["description"],
        status=ms["status"],
        locked=ms["locked"],
        start_date=ms["start_date"],
        projected_end_date=ms["projected_end_date"],
        completed_at=ms["completed_at"],
        predicted_hours=ms["predicted_hours"],
        planned_hours=sum(t.planned_hours for t in tasks),
        actual_hours=sum(t.actual_hours for t in tasks),
        planned_cost=_money(sum(t.planned_cost for t in tasks)),
        actual_cost=_money(sum(t.actual_cost for t in tasks)),
        progress=progress(ms["tasks_completed"], ms["tasks_total"]),
        tasks=tasks,
        notes=[Note(**n) for n in repo.notes(conn, milestone_id)],
        can_approve=manages and blocker is None,
        approve_blocker=blocker if manages else None,
        assignable=repo.assignable_people(conn, ms["project_id"]) if manages and ms["status"] != "completed" else [],
    )


def create_milestone(conn: psycopg.Connection, user: dict[str, Any], project_id: int, data: MilestoneCreate) -> MilestoneDetail:
    """Manager appends a milestone to their project; it depends on the one before it."""
    project = repo.project_brief(conn, project_id)
    if project is None:
        raise _not_found("Project")
    _require_manager_of(user, {**project, "project_status": project["status"]})
    if data.start_date and data.projected_end_date and data.start_date > data.projected_end_date:
        raise AppError(400, "VALIDATION_ERROR", "Request validation failed", {"projected_end_date": "End date must be on or after the start date"})
    created = repo.insert_milestone(conn, project_id, data.model_dump())
    audit.record(
        conn, actor_id=user["id"], action="created", entity_type="milestone", entity_id=created["id"], entity_code=project["code"],
        summary=f"Created milestone {created['sequence']:02d} {data.name} in {project['name']}", details={"after": data.model_dump(mode="json")},
    )
    return get_milestone(conn, user, created["id"])


def approve_milestone(conn: psycopg.Connection, user: dict[str, Any], milestone_id: int) -> MilestoneDetail:
    """Manager approves a milestone once every task in it is completed; unlocks the next."""
    ms = repo.milestone(conn, milestone_id)
    if ms is None:
        raise _not_found("Milestone")
    _require_manager_of(user, ms)
    blocker = _approve_blocker(ms)
    if blocker:
        raise _conflict(blocker)
    repo.set_milestone_status(conn, milestone_id, "completed", completed=True)
    audit.record(
        conn, actor_id=user["id"], action="approved", entity_type="milestone", entity_id=milestone_id, entity_code=ms["project_code"],
        summary=f"Approved milestone {ms['name']}", details={"before": {"status": ms["status"]}, "after": {"status": "completed"}},
    )
    return get_milestone(conn, user, milestone_id)


def close_project(conn: psycopg.Connection, user: dict[str, Any], project_id: int) -> ProjectCloseResult:
    """Manager closes a project once every milestone is approved."""
    project = repo.project_brief(conn, project_id)
    if project is None:
        raise _not_found("Project")
    _require_manager_of(user, {**project, "project_status": project["status"]})
    statuses = repo.milestone_statuses(conn, project_id)
    if not statuses:
        raise _conflict("Add and complete at least one milestone before closing the project")
    remaining = sum(1 for s in statuses if s != "completed")
    if remaining:
        raise _conflict(f"{remaining} of {len(statuses)} milestones are not approved yet")
    repo.close_project(conn, project_id)
    audit.record(
        conn, actor_id=user["id"], action="closed", entity_type="project", entity_id=project_id, entity_code=project["code"],
        summary=f"Closed project {project['name']}", details={"before": {"status": "active"}, "after": {"status": "closed"}},
    )
    return ProjectCloseResult(id=project_id, code=project["code"], status="closed")


# --- Notes ------------------------------------------------------------------------------------


def add_note(conn: psycopg.Connection, user: dict[str, Any], milestone_id: int, data: NoteCreate) -> MilestoneDetail:
    """Anyone on the project (or its manager) adds a note to the milestone conversation."""
    ms = repo.milestone(conn, milestone_id)
    if ms is None or not _can_view_project(conn, user, {"id": ms["project_id"], "manager_id": ms["manager_id"], "is_archived": ms["is_archived"]}):
        raise _not_found("Milestone")
    if user["role"] == "admin":
        raise AppError(403, "FORBIDDEN", "Administrators read milestone notes but do not post them")
    note_id = repo.insert_note(conn, milestone_id, user["id"], data.note_text.strip())
    audit.record(
        conn, actor_id=user["id"], action="noted", entity_type="milestone", entity_id=milestone_id, entity_code=ms["project_code"],
        summary=f"Added a note on milestone {ms['name']}", details={"after": {"note_id": note_id}},
    )
    return get_milestone(conn, user, milestone_id)
