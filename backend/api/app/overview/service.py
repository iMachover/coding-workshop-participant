"""
Builds the Overview payloads from repository rows.

The derived values follow the role specs: health (EMPLOYEE.md §2), progress as
completed / total tasks, cost as hours x hourly rate plus resources
(MANAGER.md §2), "this week" as Monday to Sunday containing today, capacity 40 h.
"""

from datetime import date, timedelta
from typing import Any

import psycopg

from app.core.errors import AppError
from app.overview import repository as repo
from app.overview.schemas import (
    ActiveMilestone,
    AdminOverview,
    AdminStats,
    AssignedTask,
    AuditEntry,
    EmployeeOverview,
    EmployeeStats,
    FocusProject,
    ManagerCoverage,
    ManagerOverview,
    ManagerStats,
    MilestoneCard,
    NextMilestone,
    PersonCapacity,
    PortfolioProject,
    Progress,
    ProjectOption,
    ResourceSnapshot,
    ReviewItem,
    Week,
)

WEEKLY_CAPACITY_HOURS = 40.0
RECENT_AUDIT_LIMIT = 4

# Order of the employee's work table: what they are doing first, what they can't start last.
_DISPLAY_ORDER = {"in_progress": 0, "submitted": 1, "assigned": 2, "queued": 3, "blocked": 4}


def current_week(today: date | None = None) -> Week:
    """Monday to Sunday containing `today`."""
    today = today or date.today()
    start = today - timedelta(days=today.weekday())
    return Week(start=start, end=start + timedelta(days=6), capacity_hours=WEEKLY_CAPACITY_HOURS)


def progress(completed: int, total: int) -> Progress:
    """Completed / total with a whole-number percentage (0 when there is nothing to do)."""
    percent = round(100 * completed / total) if total else 0
    return Progress(completed=completed, total=total, percent=percent)


def health(project: dict[str, Any]) -> str:
    """At risk if the active milestone is overdue or logged hours exceed planned hours."""
    over_hours = project["planned_hours"] > 0 and project["actual_hours"] > project["planned_hours"]
    return "at_risk" if project["milestone_overdue"] or over_hours else "on_track"


def _percent_of(part: float, whole: float) -> int:
    return round(100 * part / whole) if whole else 0


def _money(value: float) -> float:
    return round(value, 2)


# --- Employee ---------------------------------------------------------------------------------


def _active_milestone_id(tasks: list[dict[str, Any]]) -> int | None:
    """The milestone holding the employee's in-progress work, else their submitted work."""
    for status in ("in_progress", "submitted"):
        for task in tasks:
            if task["status"] == status:
                return task["milestone_id"]
    return None


def _display_status(task: dict[str, Any], active_milestone_id: int | None) -> str:
    """Stored status, or Blocked / Queued for assigned tasks the employee can't start yet."""
    if task["status"] != "assigned":
        return task["status"]
    if task["milestone_locked"]:
        return "blocked"
    if active_milestone_id is not None and task["milestone_id"] != active_milestone_id:
        return "queued"
    return "assigned"


def employee_overview(conn: psycopg.Connection, user: dict[str, Any]) -> EmployeeOverview:
    """Stat cards, active milestone, open tasks and hours for one employee."""
    week = current_week()
    rate = float(user["hourly_rate"])
    tasks = repo.employee_tasks(conn, user["id"])
    projects = repo.employee_projects(conn, user["id"])
    hours = repo.employee_hours(conn, user["id"], week.start, week.end)
    active_id = _active_milestone_id(tasks)

    open_tasks = sorted(
        (
            AssignedTask(
                id=t["id"],
                code=t["code"],
                title=t["title"],
                project_code=t["project_code"],
                project_name=t["project_name"],
                milestone_name=t["milestone_name"],
                status=t["status"],
                display_status=_display_status(t, active_id),
                due_date=t["due_date"],
                actual_hours=t["actual_hours"],
                planned_hours=t["planned_hours"],
                actual_cost=_money(t["actual_hours"] * rate),
                planned_cost=_money(t["planned_hours"] * rate),
            )
            for t in tasks
            if t["status"] != "completed"
        ),
        key=lambda t: (_DISPLAY_ORDER[t.display_status], t.due_date or date.max),
    )

    completed = sum(1 for t in tasks if t["status"] == "completed")
    stats = EmployeeStats(
        project_count=len(projects),
        departments=sorted({p["department"] for p in projects}),
        managers=sorted({p["manager_name"] for p in projects}),
        hours_this_week=hours["week_hours"],
        cost_this_week=_money(hours["week_hours"] * rate),
        hourly_rate=rate,
        tasks=progress(completed, len(tasks)),
        tasks_submitted=sum(1 for t in tasks if t["status"] == "submitted"),
    )

    return EmployeeOverview(
        week=week,
        stats=stats,
        active_milestone=_employee_active_milestone(conn, tasks, projects, active_id, rate),
        tasks=open_tasks,
        snapshot=ResourceSnapshot(
            hours_this_week=hours["week_hours"],
            available_hours=max(WEEKLY_CAPACITY_HOURS - hours["week_hours"], 0),
            lifetime_hours=hours["lifetime_hours"],
            lifetime_cost=_money(hours["lifetime_hours"] * rate),
        ),
    )


def _employee_active_milestone(
    conn: psycopg.Connection,
    tasks: list[dict[str, Any]],
    projects: list[dict[str, Any]],
    active_id: int | None,
    rate: float,
) -> ActiveMilestone | None:
    """The banner for the milestone the employee is working in, or None if they have none."""
    if active_id is None:
        return None
    mine = [t for t in tasks if t["milestone_id"] == active_id]
    first = mine[0]
    project_rows = repo.project_rows(conn, project_ids=[first["project_id"]])
    if not project_rows:
        return None
    project = project_rows[0]
    team_names = next((p["team_names"] for p in projects if p["id"] == first["project_id"]), None)
    counts = repo.milestone_task_counts(conn, active_id)
    upcoming = repo.next_milestone(conn, first["project_id"], first["milestone_sequence"])
    open_due = [t["due_date"] for t in mine if t["status"] != "completed" and t["due_date"]]
    actual_hours = sum(t["actual_hours"] for t in mine)
    planned_hours = sum(t["planned_hours"] for t in mine)

    return ActiveMilestone(
        id=active_id,
        name=first["milestone_name"],
        project_code=first["project_code"],
        project_name=first["project_name"],
        team_names=team_names,
        manager_name=project["manager_name"],
        health=health(project),
        due_date=first["milestone_due"],
        next_task_due=min(open_due) if open_due else None,
        progress=progress(counts["completed"], counts["total"]),
        my_actual_hours=actual_hours,
        my_planned_hours=planned_hours,
        my_actual_cost=_money(actual_hours * rate),
        my_planned_cost=_money(planned_hours * rate),
        # The next milestone stays locked until this one is approved.
        next_milestone=NextMilestone(
            name=upcoming["name"], projected_end_date=upcoming["projected_end_date"], locked=True
        )
        if upcoming
        else None,
    )


# --- Manager ----------------------------------------------------------------------------------


def manager_overview(conn: psycopg.Connection, user: dict[str, Any], project_id: int | None) -> ManagerOverview:
    """Stat cards, project in focus, review queue and team capacity for one manager."""
    week = current_week()
    projects = repo.project_rows(conn, manager_id=user["id"])
    if project_id is not None and all(p["id"] != project_id for p in projects):
        raise AppError(403, "FORBIDDEN", "You can only view projects you manage")
    focus_row = next((p for p in projects if p["id"] == project_id), projects[0] if projects else None)

    queue = repo.review_queue(conn, user["id"])
    at_risk = sum(1 for p in projects if health(p) == "at_risk")

    return ManagerOverview(
        week=week,
        projects=[ProjectOption(id=p["id"], code=p["code"], name=p["name"]) for p in projects],
        stats=ManagerStats(
            active_projects=len(projects),
            on_track=len(projects) - at_risk,
            at_risk=at_risk,
            pending_approvals=len(queue),
        ),
        focus=_focus_project(conn, focus_row) if focus_row else None,
        review_queue=[
            ReviewItem(
                id=r["id"],
                code=r["code"],
                title=r["title"],
                employee_name=r["employee_name"],
                project_code=r["project_code"],
                milestone_name=r["milestone_name"],
                submitted_at=r["submitted_at"],
                actual_hours=r["actual_hours"],
                planned_hours=r["planned_hours"],
                actual_cost=_money(r["actual_cost"]),
            )
            for r in queue
        ],
        people=[
            PersonCapacity(
                id=r["id"],
                name=f"{r['first_name']} {r['last_name']}",
                job_title=r["job_title"],
                team_names=r["team_names"],
                hours_this_week=r["hours_this_week"],
                over_capacity=r["hours_this_week"] > WEEKLY_CAPACITY_HOURS,
                progress=progress(r["tasks_completed"], r["tasks_total"]),
            )
            for r in repo.direct_reports(conn, user["id"], week.start, week.end)
        ],
    )


def _focus_project(conn: psycopg.Connection, project: dict[str, Any]) -> FocusProject:
    """The selected project's figures and milestone sequence."""
    return FocusProject(
        id=project["id"],
        code=project["code"],
        name=project["name"],
        description=project["description"],
        health=health(project),
        end_date=project["end_date"],
        manager_name=project["manager_name"],
        progress=progress(project["tasks_completed"], project["tasks_total"]),
        budget=project["budget"],
        planned_cost=_money(project["planned_cost"]),
        actual_cost=_money(project["actual_cost"]),
        remaining_budget=_money(project["budget"] - project["actual_cost"]),
        budget_used_percent=_percent_of(project["actual_cost"], project["budget"]),
        planned_hours=project["planned_hours"],
        actual_hours=project["actual_hours"],
        hours_used_percent=_percent_of(project["actual_hours"], project["planned_hours"]),
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
            for m in repo.milestone_rows(conn, project["id"])
        ],
    )


# --- Admin ------------------------------------------------------------------------------------


def admin_overview(conn: psycopg.Connection) -> AdminOverview:
    """Portfolio totals, every active project, manager coverage and the latest audit entries."""
    projects = repo.project_rows(conn)
    managers = repo.manager_coverage(conn)
    at_risk = sum(1 for p in projects if health(p) == "at_risk")

    return AdminOverview(
        stats=AdminStats(
            active_projects=len(projects),
            on_track=len(projects) - at_risk,
            at_risk=at_risk,
            portfolio_budget=_money(sum(p["budget"] for p in projects)),
            actual_cost=_money(sum(p["actual_cost"] for p in projects)),
            actual_hours=sum(p["actual_hours"] for p in projects),
            planned_hours=sum(p["planned_hours"] for p in projects),
            active_people=repo.active_user_count(conn),
            managers=len(managers),
        ),
        portfolio=[
            PortfolioProject(
                id=p["id"],
                code=p["code"],
                name=p["name"],
                department=p["department"],
                manager_name=p["manager_name"],
                health=health(p),
                progress=progress(p["tasks_completed"], p["tasks_total"]),
                actual_cost=_money(p["actual_cost"]),
                budget=p["budget"],
                end_date=p["end_date"],
            )
            for p in projects
        ],
        managers=[
            ManagerCoverage(
                id=m["id"],
                name=f"{m['first_name']} {m['last_name']}",
                active_projects=m["active_projects"],
                budget_owned=m["budget_owned"],
            )
            for m in managers
        ],
        recent_audit=[AuditEntry(**row) for row in repo.latest_audit(conn, RECENT_AUDIT_LIMIT)],
    )
