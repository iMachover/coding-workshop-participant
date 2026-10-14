"""
Time entry rules (EMPLOYEE.md §2).

Hours are logged after the work, never timed: one entry is a task, a day and a number of
hours (0 < hours <= 24, and no more than 24 hours on one day in total). An employee logs
only on their own tasks that are in progress or submitted, on an active project, and may
correct or delete their own entries while the task is not completed. Managers read every
entry on a task of their projects; admins read everything. Every write records an audit row.
"""

from datetime import date
from typing import Any

import psycopg

from app.core import audit
from app.core.errors import AppError
from app.hours import repository as repo
from app.hours.schemas import MAX_HOURS_PER_ENTRY, Ledger, LoggableTask, TimeEntry, TimeEntryCreate, TimeEntryUpdate
from app.overview import repository as overview_repo
from app.overview.service import WEEKLY_CAPACITY_HOURS, current_week
from app.work import repository as work_repo

MAX_RANGE_DAYS = 92


def _money(value: float) -> float:
    return round(value, 2)


def _validation(fields: dict[str, str]) -> AppError:
    return AppError(400, "VALIDATION_ERROR", "Request validation failed", fields)


def _entry(row: dict[str, Any], viewer: dict[str, Any]) -> TimeEntry:
    editable = (
        viewer["role"] == "employee"
        and row["user_id"] == viewer["id"]
        and row["task_status"] != "completed"
        and row["project_status"] == "active"
        and not row["is_archived"]
    )
    return TimeEntry(
        id=row["id"],
        work_date=row["work_date"],
        hours=row["hours"],
        cost=_money(row["cost"]),
        note=row["note"],
        user_id=row["user_id"],
        user_name=row["user_name"],
        task_id=row["task_id"],
        task_code=row["task_code"],
        task_title=row["task_title"],
        task_status=row["task_status"],
        project_id=row["project_id"],
        project_code=row["project_code"],
        project_name=row["project_name"],
        editable=editable,
    )


# --- Reading ----------------------------------------------------------------------------------


def ledger(conn: psycopg.Connection, user: dict[str, Any], start: date | None, end: date | None) -> Ledger:
    """The employee's entries for a range (default: this week) with the week's totals."""
    week = current_week()
    start = start or week.start
    end = end or (start + (week.end - week.start))
    if end < start:
        raise _validation({"to": "The end date must be on or after the start date"})
    if (end - start).days > MAX_RANGE_DAYS:
        raise _validation({"to": f"Choose a range of at most {MAX_RANGE_DAYS} days"})
    rate = float(user["hourly_rate"])
    rows = repo.entries_of_user(conn, user["id"], start, end)
    totals = overview_repo.employee_hours(conn, user["id"], week.start, week.end)
    range_hours = sum(r["hours"] for r in rows)
    return Ledger(
        week=week,
        range_start=start,
        range_end=end,
        entries=[_entry(r, user) for r in rows],
        range_hours=range_hours,
        range_cost=_money(range_hours * rate),
        hours_this_week=totals["week_hours"],
        cost_this_week=_money(totals["week_hours"] * rate),
        available_hours=max(WEEKLY_CAPACITY_HOURS - totals["week_hours"], 0),
        hourly_rate=rate,
        lifetime_hours=totals["lifetime_hours"],
        lifetime_cost=_money(totals["lifetime_hours"] * rate),
        loggable_tasks=[LoggableTask(**t) for t in repo.loggable_tasks(conn, user["id"])],
    )


def task_entries(conn: psycopg.Connection, user: dict[str, Any], task_id: int) -> list[TimeEntry]:
    """Entries on a task: the employee's own, every entry for the project's manager or an admin."""
    task = work_repo.task(conn, task_id)
    if task is None:
        raise AppError(404, "NOT_FOUND", "Task not found")
    if user["role"] == "employee":
        if task["assignee_id"] != user["id"]:
            raise AppError(404, "NOT_FOUND", "Task not found")
        rows = repo.entries_of_task(conn, task_id, user["id"])
    elif user["role"] == "manager":
        if task["manager_id"] != user["id"] or task["is_archived"]:
            raise AppError(404, "NOT_FOUND", "Task not found")
        rows = repo.entries_of_task(conn, task_id)
    else:
        rows = repo.entries_of_task(conn, task_id)
    return [_entry(r, user) for r in rows]


# --- Writes -----------------------------------------------------------------------------------


def _check_day(conn: psycopg.Connection, user_id: int, day: date, hours: float, exclude_id: int | None = None) -> None:
    if day > date.today():
        raise _validation({"work_date": "Hours are logged after the work; the date cannot be in the future"})
    already = repo.hours_on_day(conn, user_id, day, exclude_id)
    if already + hours > MAX_HOURS_PER_ENTRY:
        raise _validation({"hours": f"That makes {already + hours:g} h on {day.isoformat()}; a day holds at most {MAX_HOURS_PER_ENTRY} h"})


def log_hours(conn: psycopg.Connection, user: dict[str, Any], task_id: int, data: TimeEntryCreate) -> TimeEntry:
    """Employee logs hours on one of their tasks in progress or submitted."""
    if user["role"] != "employee":
        raise AppError(403, "FORBIDDEN", "Only the assigned employee logs hours on a task")
    task = work_repo.task(conn, task_id)
    if task is None or task["assignee_id"] != user["id"]:
        raise AppError(404, "NOT_FOUND", "Task not found")
    if task["is_archived"] or task["project_status"] != "active":
        raise AppError(409, "CONFLICT", "This project is closed or archived")
    if task["status"] == "assigned":
        raise AppError(409, "CONFLICT", "Start the task before logging hours on it")
    if task["status"] == "completed":
        raise AppError(409, "CONFLICT", "This task is completed; its hours can no longer change")
    _check_day(conn, user["id"], data.work_date, data.hours)

    note = data.note.strip() if data.note and data.note.strip() else None
    entry_id = repo.insert(conn, task_id, user["id"], data.work_date, data.hours, note)
    audit.record(
        conn,
        actor_id=user["id"],
        action="logged_hours",
        entity_type="task",
        entity_id=task_id,
        entity_code=task["code"],
        summary=f"Logged {data.hours:g} h on {task['title']}",
        details={"after": {"entry_id": entry_id, "work_date": data.work_date.isoformat(), "hours": data.hours, "note": note}},
    )
    return _entry(repo.entry(conn, entry_id), user)


def _own_open_entry(conn: psycopg.Connection, user: dict[str, Any], entry_id: int) -> dict[str, Any]:
    if user["role"] != "employee":
        raise AppError(403, "FORBIDDEN", "Only the person who logged the hours can change them")
    row = repo.entry(conn, entry_id)
    if row is None or row["user_id"] != user["id"]:
        raise AppError(404, "NOT_FOUND", "Time entry not found")
    if row["task_status"] == "completed":
        raise AppError(409, "CONFLICT", "This task is completed; its hours can no longer change")
    if row["is_archived"] or row["project_status"] != "active":
        raise AppError(409, "CONFLICT", "This project is closed or archived")
    return row


def correct_entry(conn: psycopg.Connection, user: dict[str, Any], entry_id: int, data: TimeEntryUpdate) -> TimeEntry:
    """Employee corrects the date, hours or note of their own entry."""
    row = _own_open_entry(conn, user, entry_id)
    fields = data.model_dump(exclude_unset=True)
    if "note" in fields:
        fields["note"] = fields["note"].strip() if fields["note"] and fields["note"].strip() else None
    day = fields.get("work_date", row["work_date"])
    hours = fields.get("hours", row["hours"])
    if "work_date" in fields or "hours" in fields:
        _check_day(conn, user["id"], day, hours, exclude_id=entry_id)

    before = {k: row[k] for k in fields}
    repo.update(conn, entry_id, fields)
    diff = audit.changes(_jsonable(before), _jsonable(fields))
    if diff["after"]:
        audit.record(
            conn,
            actor_id=user["id"],
            action="updated",
            entity_type="task",
            entity_id=row["task_id"],
            entity_code=row["task_code"],
            summary=f"Corrected hours on {row['task_title']} ({', '.join(diff['after'])})",
            details={**diff, "entry_id": entry_id},
        )
    return _entry(repo.entry(conn, entry_id), user)


def delete_entry(conn: psycopg.Connection, user: dict[str, Any], entry_id: int) -> None:
    """Employee removes their own entry while the task is not completed."""
    row = _own_open_entry(conn, user, entry_id)
    repo.delete(conn, entry_id)
    audit.record(
        conn,
        actor_id=user["id"],
        action="deleted",
        entity_type="task",
        entity_id=row["task_id"],
        entity_code=row["task_code"],
        summary=f"Removed {row['hours']:g} h logged on {row['task_title']}",
        details={"before": {"entry_id": entry_id, "work_date": row["work_date"].isoformat(), "hours": row["hours"], "note": row["note"]}},
    )


def _jsonable(values: dict[str, Any]) -> dict[str, Any]:
    return {k: (v.isoformat() if isinstance(v, date) else v) for k, v in values.items()}
