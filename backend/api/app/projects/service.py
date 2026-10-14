"""
Project rules (ADMIN.md §7, MANAGER.md §7, EMPLOYEE.md §7).

Who sees what: admins see every project; managers only those they manage; employees
only projects they are on through a team or an assigned task. Admins create, change the
manager, archive and restore. Managers may change name, description, dates and budget
on their own projects. Every write records an audit row.
"""

from datetime import date
from typing import Any

import psycopg

from app.core import audit
from app.core.errors import AppError
from app.overview import repository as overview_repo
from app.overview.schemas import MilestoneCard
from app.overview.service import health, progress
from app.projects import repository as repo
from app.projects.schemas import (
    DepartmentOption,
    ManagerOption,
    MyFigures,
    ProjectCreate,
    ProjectDetail,
    ProjectRow,
    ProjectUpdate,
)

_MANAGER_FIELDS = {"name", "description", "start_date", "end_date", "budget"}
_ADMIN_FIELDS = _MANAGER_FIELDS | {"manager_id"}


def _money(value: float) -> float:
    return round(value, 2)


def _row(project: dict[str, Any], mine: MyFigures | None = None) -> ProjectRow:
    return ProjectRow(
        id=project["id"],
        code=project["code"],
        name=project["name"],
        description=project["description"],
        department_id=project["department_id"],
        department=project["department"],
        manager_id=project["manager_id"],
        manager_name=project["manager_name"],
        status=project["status"],
        is_archived=project["is_archived"],
        health=health(project),
        start_date=project["start_date"],
        end_date=project["end_date"],
        budget=project["budget"],
        planned_hours=project["planned_hours"],
        actual_hours=project["actual_hours"],
        planned_cost=_money(project["planned_cost"]),
        actual_cost=_money(project["actual_cost"]),
        progress=progress(project["tasks_completed"], project["tasks_total"]),
        team_names=list(project["team_names"]),
        mine=mine,
    )


def _my_figures(user: dict[str, Any], figures: dict[int, dict[str, float]], project_id: int) -> MyFigures:
    rate = float(user["hourly_rate"])
    f = figures.get(project_id, {"planned_hours": 0.0, "actual_hours": 0.0})
    return MyFigures(
        planned_hours=f["planned_hours"],
        actual_hours=f["actual_hours"],
        planned_cost=_money(f["planned_hours"] * rate),
        actual_cost=_money(f["actual_hours"] * rate),
    )


def _scope(user: dict[str, Any]) -> dict[str, Any]:
    """Repository filters that limit a listing to what the role may see."""
    if user["role"] == "admin":
        return {}
    if user["role"] == "manager":
        return {"manager_id": user["id"]}
    return {"member_user_id": user["id"]}


def list_projects(
    conn: psycopg.Connection,
    user: dict[str, Any],
    *,
    query: str | None = None,
    archived: bool = False,
) -> list[ProjectRow]:
    """The projects the user may see. `archived` (admin only) lists archived ones instead."""
    if archived and user["role"] != "admin":
        raise AppError(403, "FORBIDDEN", "Only administrators can view archived projects")
    rows = overview_repo.project_rows(
        conn, query=query, include_archived=archived, include_closed=True, **_scope(user)
    )
    if archived:
        rows = [r for r in rows if r["is_archived"]]
    figures = repo.employee_figures(conn, user["id"]) if user["role"] == "employee" else {}
    return [
        _row(r, _my_figures(user, figures, r["id"]) if user["role"] == "employee" else None)
        for r in rows
    ]


def get_project(conn: psycopg.Connection, user: dict[str, Any], project_id: int) -> ProjectDetail:
    """One project with its milestones. 404 if it is outside what the user may see."""
    rows = overview_repo.project_rows(
        conn,
        project_ids=[project_id],
        include_archived=user["role"] == "admin",
        include_closed=True,
        **_scope(user),
    )
    if not rows:
        raise AppError(404, "NOT_FOUND", "Project not found")
    project = rows[0]
    mine = None
    if user["role"] == "employee":
        mine = _my_figures(user, repo.employee_figures(conn, user["id"]), project_id)
    base = _row(project, mine)
    return ProjectDetail(
        **base.model_dump(),
        milestones=[
            MilestoneCard(
                id=m["id"],
                sequence=m["sequence"],
                name=m["name"],
                status=m["status"],
                locked=m["locked"],
                start_date=m["start_date"],
                projected_end_date=m["projected_end_date"],
                completed_at=m["completed_at"],
                progress=progress(m["tasks_completed"], m["tasks_total"]),
            )
            for m in overview_repo.milestone_rows(conn, project_id)
        ],
    )


def _check_dates(start: date, end: date) -> None:
    if start > end:
        raise AppError(400, "VALIDATION_ERROR", "Request validation failed", {"end_date": "End date must be on or after the start date"})


def _check_manager(conn: psycopg.Connection, manager_id: int) -> None:
    person = repo.user_role(conn, manager_id)
    if person is None or person["role"] != "manager" or person["is_archived"]:
        raise AppError(400, "VALIDATION_ERROR", "Request validation failed", {"manager_id": "Choose an active manager"})


def create_project(conn: psycopg.Connection, admin: dict[str, Any], data: ProjectCreate) -> ProjectDetail:
    """Admin creates a project; the code comes from the department's prefix and counter."""
    _check_dates(data.start_date, data.end_date)
    _check_manager(conn, data.manager_id)
    code = repo.next_code(conn, data.department_id)
    if code is None:
        raise AppError(400, "VALIDATION_ERROR", "Request validation failed", {"department_id": "Choose a department"})
    project_id = repo.insert(
        conn,
        code=code,
        name=data.name,
        description=data.description,
        department_id=data.department_id,
        manager_id=data.manager_id,
        start_date=data.start_date,
        end_date=data.end_date,
        budget=data.budget,
    )
    audit.record(
        conn,
        actor_id=admin["id"],
        action="created",
        entity_type="project",
        entity_id=project_id,
        entity_code=code,
        summary=f"Created project {data.name}",
        details={"after": data.model_dump(mode="json")},
    )
    return get_project(conn, admin, project_id)


def update_project(
    conn: psycopg.Connection, user: dict[str, Any], project_id: int, data: ProjectUpdate
) -> ProjectDetail:
    """Admin changes any field; a manager changes name, description, dates and budget of their own."""
    project = repo.find_by_id(conn, project_id)
    if project is None or (project["is_archived"] and user["role"] != "admin"):
        raise AppError(404, "NOT_FOUND", "Project not found")
    if user["role"] == "manager" and project["manager_id"] != user["id"]:
        raise AppError(403, "FORBIDDEN", "You can only change projects you manage")
    if user["role"] == "employee":
        raise AppError(403, "FORBIDDEN", "You do not have permission to perform this action")

    fields = data.model_dump(exclude_unset=True)
    allowed = _ADMIN_FIELDS if user["role"] == "admin" else _MANAGER_FIELDS
    blocked = sorted(set(fields) - allowed)
    if blocked:
        raise AppError(403, "FORBIDDEN", "You can only change name, description, dates and budget", {f: "Not allowed for your role" for f in blocked})
    if "name" in fields and not fields["name"].strip():
        raise AppError(400, "VALIDATION_ERROR", "Request validation failed", {"name": "Project name is required"})
    if "name" in fields:
        fields["name"] = fields["name"].strip()
    _check_dates(fields.get("start_date", project["start_date"]), fields.get("end_date", project["end_date"]))
    if "manager_id" in fields:
        _check_manager(conn, fields["manager_id"])

    before = {k: project[k] for k in fields}
    repo.update(conn, project_id, fields)
    diff = audit.changes(
        {k: (v.isoformat() if isinstance(v, date) else v) for k, v in before.items()},
        {k: (v.isoformat() if isinstance(v, date) else v) for k, v in fields.items()},
    )
    if diff["after"]:
        audit.record(
            conn,
            actor_id=user["id"],
            action="updated",
            entity_type="project",
            entity_id=project_id,
            entity_code=project["code"],
            summary=f"Updated project {project['name']} ({', '.join(diff['after'])})",
            details=diff,
        )
    return get_project(conn, user, project_id)


def set_archived(conn: psycopg.Connection, admin: dict[str, Any], project_id: int, archived: bool) -> ProjectDetail:
    """Archive or restore a project. 409 if it is already in that state."""
    project = repo.find_by_id(conn, project_id)
    if project is None:
        raise AppError(404, "NOT_FOUND", "Project not found")
    if project["is_archived"] == archived:
        state = "archived" if archived else "active"
        raise AppError(409, "CONFLICT", f"Project is already {state}")
    repo.set_archived(conn, project_id, archived)
    audit.record(
        conn,
        actor_id=admin["id"],
        action="archived" if archived else "restored",
        entity_type="project",
        entity_id=project_id,
        entity_code=project["code"],
        summary=f"{'Archived' if archived else 'Restored'} project {project['name']}",
        details={"before": {"is_archived": not archived}, "after": {"is_archived": archived}},
    )
    return get_project(conn, admin, project_id)


def form_options(conn: psycopg.Connection) -> dict[str, list[Any]]:
    """Managers and departments for the admin's create / edit project form."""
    return {
        "managers": [ManagerOption(**r) for r in repo.manager_options(conn)],
        "departments": [DepartmentOption(**r) for r in repo.department_options(conn)],
    }
