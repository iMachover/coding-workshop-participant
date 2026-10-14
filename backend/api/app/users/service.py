"""
People rules (ADMIN.md §2, MANAGER.md §2).

Admins create accounts (the server generates the 6-character username), edit any field but
the username, change roles and archive or restore people. A role change or an archive is
refused (409) while a manager still owns active projects or has direct reports, or while an
employee has tasks that are not completed; an admin can never archive themselves or the
last active administrator.

Reporting line (WORKSHOP_NOTES.md: managers pick from the employee list, one manager per
employee): an employee starts unassigned; a manager takes them on from the full employee
list, which sets `manager_id`, and releases them back to the pool. Someone who already
reports to another manager is blocked until an admin moves them. Managers read their direct
reports and may change only their name and email. Every write records an audit row.
"""

import re
import secrets
import string
from typing import Any

import psycopg

from app.core import audit
from app.core.errors import AppError
from app.core.security import hash_password
from app.overview.service import WEEKLY_CAPACITY_HOURS, current_week, progress
from app.users import repository as repo
from app.users.schemas import (
    DepartmentOption,
    ManagerOption,
    MeUpdate,
    PeopleSearch,
    PickablePerson,
    RoleCounts,
    UserCreate,
    UserDetail,
    UserFormOptions,
    UserMilestone,
    UserPage,
    UserProject,
    UserRow,
    UserTeam,
    UserTimeEntry,
    UserUpdate,
)

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_USERNAME_ALPHABET = string.ascii_lowercase + string.digits
_MANAGER_FIELDS = {"first_name", "last_name", "email"}
_ADMIN_FIELDS = _MANAGER_FIELDS | {"job_title", "role", "department_id", "manager_id", "hourly_rate"}
RECENT_ENTRIES = 10


def _money(value: float) -> float:
    return round(value, 2)


def _validation(fields: dict[str, str]) -> AppError:
    return AppError(400, "VALIDATION_ERROR", "Request validation failed", fields)


def _row(r: dict[str, Any]) -> UserRow:
    return UserRow(
        id=r["id"],
        code=r["code"],
        username=r["username"],
        first_name=r["first_name"],
        last_name=r["last_name"],
        name=r["name"],
        email=r["email"],
        job_title=r["job_title"],
        role=r["role"],
        department_id=r["department_id"],
        department=r["department"],
        manager_id=r["manager_id"],
        manager_name=r["manager_name"],
        hourly_rate=r["hourly_rate"],
        is_archived=r["is_archived"],
        created_at=r["created_at"],
        team_names=list(r["team_names"]),
        hours_this_week=r["hours_this_week"],
        over_capacity=r["hours_this_week"] > WEEKLY_CAPACITY_HOURS,
        cost_this_week=_money(r["hours_this_week"] * r["hourly_rate"]),
        tasks=progress(r["tasks_completed"], r["tasks_total"]),
    )


# --- Reading ----------------------------------------------------------------------------------


def list_users(
    conn: psycopg.Connection,
    *,
    query: str | None = None,
    role: str | None = None,
    department_id: int | None = None,
    archived: bool = False,
    page: int = 1,
    limit: int = 25,
) -> UserPage:
    """Admin: one page of people, active by default, with role counts for the side card."""
    week = current_week()
    rows, total = repo.list_page(
        conn,
        week_start=week.start,
        week_end=week.end,
        query=query,
        role=role,
        department_id=department_id,
        archived=archived,
        page=page,
        limit=limit,
    )
    return UserPage(items=[_row(r) for r in rows], page=page, limit=limit, total=total, counts=RoleCounts(**repo.role_counts(conn)))


def list_direct_reports(conn: psycopg.Connection, manager: dict[str, Any], query: str | None = None) -> list[UserRow]:
    """Manager: every active person reporting to them (MANAGER.md §6.3)."""
    week = current_week()
    rows, _ = repo.list_page(conn, week_start=week.start, week_end=week.end, query=query, manager_id=manager["id"], limit=100)
    return [_row(r) for r in rows]


PICKER_PAGE = 25


def search_pickable(
    conn: psycopg.Connection,
    manager: dict[str, Any],
    *,
    query: str | None = None,
    job_title: str | None = None,
    exclude_team_id: int | None = None,
) -> PeopleSearch:
    """
    Manager's people picker: the first 25 employees they may put on a team (their own and
    unassigned; never another manager's), filtered by job title and name, minus anyone already
    on `exclude_team_id`. `total` tells the picker to narrow the filter when more matched.
    """
    week = current_week()
    rows, total = repo.pickable_people(
        conn, manager["id"], week.start, week.end, query=query, job_title=job_title, exclude_team_id=exclude_team_id, limit=PICKER_PAGE
    )
    return PeopleSearch(items=[PickablePerson(**{k: r[k] for k in PickablePerson.model_fields}) for r in rows], total=total, limit=PICKER_PAGE)


def _blockers(conn: psycopg.Connection, person: dict[str, Any]) -> list[str]:
    """What stops a role change or an archive (ADMIN.md §2)."""
    reasons = []
    if person["role"] == "manager":
        projects = repo.active_project_count(conn, person["id"])
        if projects:
            reasons.append(f"Manages {projects} active {'project' if projects == 1 else 'projects'}; reassign them to another manager first")
        reports = repo.direct_report_count(conn, person["id"])
        if reports:
            reasons.append(f"Has {reports} direct {'report' if reports == 1 else 'reports'}; move them to another manager first")
    if person["role"] == "employee":
        tasks = repo.open_task_count(conn, person["id"])
        if tasks:
            reasons.append(f"Has {tasks} {'task' if tasks == 1 else 'tasks'} not completed yet")
    return reasons


def _archive_blockers(conn: psycopg.Connection, actor: dict[str, Any], person: dict[str, Any]) -> list[str]:
    reasons = _blockers(conn, person)
    if person["id"] == actor["id"]:
        reasons.append("You cannot archive your own account")
    if person["role"] == "admin" and not person["is_archived"] and repo.active_admin_count(conn) <= 1:
        reasons.append("This is the last active administrator")
    return reasons


def get_user(conn: psycopg.Connection, viewer: dict[str, Any], user_id: int) -> UserDetail:
    """
    One person's profile. Admins open anyone (archived included); a manager only their
    direct reports (404 otherwise, so the id reveals nothing).
    """
    week = current_week()
    r = repo.person(conn, user_id, week.start, week.end)
    if r is None or (viewer["role"] != "admin" and (r["manager_id"] != viewer["id"] or r["is_archived"])):
        raise AppError(404, "NOT_FOUND", "Person not found")
    lifetime = repo.lifetime_hours(conn, user_id)
    blockers = _archive_blockers(conn, viewer, r) if viewer["role"] == "admin" else []
    return UserDetail(
        **_row(r).model_dump(),
        projects=[
            UserProject(
                id=p["id"],
                code=p["code"],
                name=p["name"],
                department=p["department"],
                status=p["status"],
                relation=p["relation"],
                progress=progress(p["tasks_completed"], p["tasks_total"]),
                planned_hours=p["planned_hours"],
                actual_hours=p["actual_hours"],
                actual_cost=_money(p["actual_cost"]),
            )
            for p in repo.person_projects(conn, user_id)
        ],
        teams=[UserTeam(**t) for t in repo.person_teams(conn, user_id)],
        milestones=[
            UserMilestone(
                id=m["id"],
                name=m["name"],
                sequence=m["sequence"],
                status=m["status"],
                project_code=m["project_code"],
                progress=progress(m["tasks_completed"], m["tasks_total"]),
            )
            for m in repo.person_milestones(conn, user_id)
        ],
        recent_entries=[UserTimeEntry(**{**e, "cost": _money(e["cost"])}) for e in repo.recent_entries(conn, user_id, RECENT_ENTRIES)],
        lifetime_hours=lifetime["hours"],
        lifetime_cost=_money(lifetime["cost"]),
        direct_reports=repo.direct_report_count(conn, user_id) if r["role"] == "manager" else 0,
        blockers=blockers,
        can_archive=viewer["role"] == "admin" and not r["is_archived"] and not blockers,
    )


def form_options(conn: psycopg.Connection) -> UserFormOptions:
    """Managers and departments for the admin's person form."""
    return UserFormOptions(
        managers=[ManagerOption(**m) for m in repo.manager_options(conn)],
        departments=[DepartmentOption(**d) for d in repo.department_options(conn)],
    )


# --- Validation -------------------------------------------------------------------------------


def _clean_email(conn: psycopg.Connection, email: str, exclude_id: int | None = None) -> str:
    email = email.strip().lower()
    if not _EMAIL.match(email):
        raise _validation({"email": "Enter a valid email address"})
    if repo.email_taken(conn, email, exclude_id):
        raise _validation({"email": "Another account already uses this email"})
    return email


def _check_manager_for_role(conn: psycopg.Connection, role: str, manager_id: int | None, person_id: int | None = None) -> None:
    """An employee reports to one active manager or to nobody yet; managers and admins report to nobody."""
    if role == "employee":
        if manager_id is None:
            return
        if manager_id == person_id:
            raise _validation({"manager_id": "A person cannot be their own manager"})
        manager = repo.find_by_id(conn, manager_id)
        if manager is None or manager["role"] != "manager" or manager["is_archived"]:
            raise _validation({"manager_id": "Choose an active manager"})
    elif manager_id is not None:
        raise _validation({"manager_id": f"A {role} does not report to a manager; leave it empty"})


def _check_department(conn: psycopg.Connection, department_id: int | None) -> None:
    if department_id is not None and not repo.department_exists(conn, department_id):
        raise _validation({"department_id": "Choose a department"})


def _new_username(conn: psycopg.Connection) -> str:
    """A unique 6-character [a-z0-9] username (ADMIN.md §2), retrying on collision."""
    for _ in range(20):
        candidate = "".join(secrets.choice(_USERNAME_ALPHABET) for _ in range(6))
        if not repo.username_taken(conn, candidate):
            return candidate
    raise AppError(500, "INTERNAL_ERROR", "Could not generate a unique username; try again")


# --- Writes -----------------------------------------------------------------------------------


def create_user(conn: psycopg.Connection, admin: dict[str, Any], data: UserCreate) -> UserDetail:
    """Admin creates an account; the username is generated and returned with the profile."""
    fields = data.model_dump(exclude={"password"})
    fields["first_name"] = fields["first_name"].strip()
    fields["last_name"] = fields["last_name"].strip()
    if not fields["first_name"] or not fields["last_name"]:
        raise _validation({"first_name" if not fields["first_name"] else "last_name": "Name is required"})
    fields["email"] = _clean_email(conn, fields["email"])
    _check_department(conn, fields["department_id"])
    _check_manager_for_role(conn, fields["role"], fields["manager_id"])

    username = _new_username(conn)
    user_id = repo.insert(conn, username=username, password_hash=hash_password(data.password), fields=fields)
    audit.record(
        conn,
        actor_id=admin["id"],
        action="created",
        entity_type="user",
        entity_id=user_id,
        entity_code=f"USR-{user_id:03d}",
        summary=f"Created {fields['role']} account for {fields['first_name']} {fields['last_name']}",
        details={"after": {**fields, "username": username}},
    )
    return get_user(conn, admin, user_id)


# --- Manager: reporting line ------------------------------------------------------------------


def _employee(conn: psycopg.Connection, user_id: int) -> dict[str, Any]:
    person = repo.find_by_id(conn, user_id)
    if person is None or person["role"] != "employee" or person["is_archived"]:
        raise AppError(404, "NOT_FOUND", "Employee not found")
    return person


def _full_name(person: dict[str, Any]) -> str:
    return f"{person['first_name']} {person['last_name']}"


def ensure_reports_to(conn: psycopg.Connection, manager: dict[str, Any], user_id: int) -> dict[str, Any]:
    """
    The active employee as one of the manager's direct reports: unchanged if they already
    are, taken on (with an audit row) if they report to nobody. 400 with a field error when
    they report to another manager, since only an admin moves people between managers.
    """
    person = _employee(conn, user_id)
    if person["manager_id"] == manager["id"]:
        return person
    if person["manager_id"] is not None:
        other = repo.find_by_id(conn, person["manager_id"])
        raise _validation({"user_id": f"{_full_name(person)} reports to {_full_name(other)}; ask an administrator to move them"})
    repo.update(conn, user_id, {"manager_id": manager["id"]})
    audit.record(
        conn,
        actor_id=manager["id"],
        action="assigned",
        entity_type="user",
        entity_id=user_id,
        entity_code=f"USR-{user_id:03d}",
        summary=f"Added {_full_name(person)} as a direct report",
        details={"before": {"manager_id": None}, "after": {"manager_id": manager["id"], "manager": _full_name(manager)}},
    )
    return {**person, "manager_id": manager["id"]}


def assign_report(conn: psycopg.Connection, manager: dict[str, Any], user_id: int) -> UserDetail:
    """Manager takes an unassigned employee on as a direct report. 409 if they already report to them."""
    person = _employee(conn, user_id)
    if person["manager_id"] == manager["id"]:
        raise AppError(409, "CONFLICT", f"{_full_name(person)} already reports to you")
    ensure_reports_to(conn, manager, user_id)
    return get_user(conn, manager, user_id)


def release_report(conn: psycopg.Connection, manager: dict[str, Any], user_id: int) -> None:
    """
    Manager releases a direct report back to the unassigned pool, taking them off every one
    of the manager's teams. 404 unless they report to this manager; 409 while they still have
    tasks that are not completed, since those live on the manager's projects.
    """
    person = repo.find_by_id(conn, user_id)
    if person is None or person["manager_id"] != manager["id"] or person["is_archived"]:
        raise AppError(404, "NOT_FOUND", "Person not found")
    tasks = repo.open_task_count(conn, user_id)
    if tasks:
        raise AppError(409, "CONFLICT", f"Release once this is resolved: has {tasks} {'task' if tasks == 1 else 'tasks'} not completed yet")
    teams = repo.leave_manager_teams(conn, manager["id"], user_id)
    repo.update(conn, user_id, {"manager_id": None})
    audit.record(
        conn,
        actor_id=manager["id"],
        action="unassigned",
        entity_type="user",
        entity_id=user_id,
        entity_code=f"USR-{user_id:03d}",
        summary=f"Released {_full_name(person)} from direct reports" + (f" and {len(teams)} {'team' if len(teams) == 1 else 'teams'}" if teams else ""),
        details={"before": {"manager_id": manager["id"], "manager": _full_name(manager), "teams": teams}, "after": {"manager_id": None}},
    )


def update_user(conn: psycopg.Connection, actor: dict[str, Any], user_id: int, data: UserUpdate) -> UserDetail:
    """
    Admin changes any field but the username; a manager changes the name and email of a
    direct report. A role change is refused while the person's current role still has work.
    """
    person = repo.find_by_id(conn, user_id)
    if person is None or (actor["role"] != "admin" and (person["manager_id"] != actor["id"] or person["is_archived"])):
        raise AppError(404, "NOT_FOUND", "Person not found")
    if actor["role"] == "employee":
        raise AppError(403, "FORBIDDEN", "You do not have permission to perform this action")

    fields = data.model_dump(exclude_unset=True)
    allowed = _ADMIN_FIELDS if actor["role"] == "admin" else _MANAGER_FIELDS
    blocked = sorted(set(fields) - allowed)
    if blocked:
        raise AppError(403, "FORBIDDEN", "You can only change a direct report's name and email", {f: "Not allowed for your role" for f in blocked})
    for name in ("first_name", "last_name"):
        if name in fields:
            fields[name] = (fields[name] or "").strip()
            if not fields[name]:
                raise _validation({name: "Name is required"})
    if "email" in fields:
        fields["email"] = _clean_email(conn, fields["email"], exclude_id=user_id)
    if "department_id" in fields:
        _check_department(conn, fields["department_id"])

    new_role = fields.get("role", person["role"])
    if new_role != person["role"]:
        blockers = _blockers(conn, person)
        if blockers:
            raise AppError(409, "CONFLICT", "Change the role once this is resolved: " + "; ".join(blockers))
        if new_role != "employee":
            fields["manager_id"] = None  # a manager or admin reports to nobody
    if "manager_id" in fields or "role" in fields:
        _check_manager_for_role(conn, new_role, fields.get("manager_id", person["manager_id"]), person_id=user_id)

    before = {k: person[k] for k in fields}
    repo.update(conn, user_id, fields)
    diff = audit.changes(_jsonable(before), _jsonable(fields))
    if diff["after"]:
        audit.record(
            conn,
            actor_id=actor["id"],
            action="updated",
            entity_type="user",
            entity_id=user_id,
            entity_code=f"USR-{user_id:03d}",
            summary=f"Updated {person['first_name']} {person['last_name']} ({', '.join(diff['after'])})",
            details=diff,
        )
    return get_user(conn, actor, user_id)


def _jsonable(values: dict[str, Any]) -> dict[str, Any]:
    return {k: float(v) if hasattr(v, "quantize") else v for k, v in values.items()}


def set_archived(conn: psycopg.Connection, admin: dict[str, Any], user_id: int, archived: bool) -> UserDetail:
    """Archive (revoking login at once) or restore a person. 409 while something blocks it."""
    person = repo.find_by_id(conn, user_id)
    if person is None:
        raise AppError(404, "NOT_FOUND", "Person not found")
    if person["is_archived"] == archived:
        raise AppError(409, "CONFLICT", f"Person is already {'archived' if archived else 'active'}")
    if archived:
        blockers = _archive_blockers(conn, admin, person)
        if blockers:
            raise AppError(409, "CONFLICT", "Archive once this is resolved: " + "; ".join(blockers))
    repo.set_archived(conn, user_id, archived)
    audit.record(
        conn,
        actor_id=admin["id"],
        action="archived" if archived else "restored",
        entity_type="user",
        entity_id=user_id,
        entity_code=f"USR-{user_id:03d}",
        summary=f"{'Archived' if archived else 'Restored'} {person['first_name']} {person['last_name']}",
        details={"before": {"is_archived": not archived}, "after": {"is_archived": archived}},
    )
    return get_user(conn, admin, user_id)


def update_me(conn: psycopg.Connection, user: dict[str, Any], data: MeUpdate) -> dict[str, Any]:
    """Anyone changes their own first name, last name or email. Returns the fresh user row."""
    fields = data.model_dump(exclude_unset=True)
    for name in ("first_name", "last_name"):
        if name in fields:
            fields[name] = (fields[name] or "").strip()
            if not fields[name]:
                raise _validation({name: "Name is required"})
    if "email" in fields:
        fields["email"] = _clean_email(conn, fields["email"], exclude_id=user["id"])
    before = {k: user[k] for k in fields}
    repo.update(conn, user["id"], fields)
    diff = audit.changes(before, fields)
    if diff["after"]:
        audit.record(
            conn,
            actor_id=user["id"],
            action="updated",
            entity_type="user",
            entity_id=user["id"],
            entity_code=f"USR-{user['id']:03d}",
            summary=f"Updated own profile ({', '.join(diff['after'])})",
            details=diff,
        )
    return repo.find_by_id(conn, user["id"])
