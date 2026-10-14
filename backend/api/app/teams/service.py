"""
Team rules (MANAGER.md §2, EMPLOYEE.md §6.4).

A team belongs to one manager; its members must be that manager's active direct reports.
The manager picks from their own and unassigned employees (GET /employees/search): an
unassigned employee becomes their direct report the moment they join a team, while someone
who reports to another manager is never offered and is refused (400) if sent anyway. Only the project's manager attaches teams, and only their
own, so "who can be assigned a task" (slice 3) follows from these links. Employees read the teams they are on with each
teammate's progress, never their cost. Every write records an audit row.
"""

from typing import Any

import psycopg

from app.core import audit
from app.core.errors import AppError
from app.overview import repository as overview_repo
from app.overview.service import current_week, health, progress
from app.teams import repository as repo
from app.teams.schemas import (
    CurrentMilestone,
    ManagerCard,
    MyTeam,
    MyTeamProject,
    MyTeams,
    Team,
    TeamCreate,
    TeamMember,
    TeamOptions,
    TeamProject,
    Teammate,
    TeamUpdate,
)
from app.users import repository as users_repo
from app.users import service as users_service
from app.work import repository as work_repo


def _validation(fields: dict[str, str]) -> AppError:
    return AppError(400, "VALIDATION_ERROR", "Request validation failed", fields)


def _code(team_id: int) -> str:
    return f"TEAM-{team_id:02d}"


def _team(row: dict[str, Any]) -> Team:
    return Team(
        id=row["id"],
        code=row["code"],
        name=row["name"],
        manager_id=row["manager_id"],
        members=[TeamMember(**m) for m in row["members"]],
        projects=[TeamProject(**p) for p in row["projects"]],
        hours_this_week=row["hours_this_week"],
    )


# --- Manager ----------------------------------------------------------------------------------


def list_teams(conn: psycopg.Connection, manager: dict[str, Any]) -> list[Team]:
    """The manager's teams with members, projects and hours this week."""
    week = current_week()
    return [_team(r) for r in repo.teams_of_manager(conn, manager["id"], week.start, week.end)]


def get_team(conn: psycopg.Connection, manager: dict[str, Any], team_id: int) -> Team:
    """One of the manager's teams; 404 for anyone else's."""
    week = current_week()
    row = repo.team_detail(conn, team_id, week.start, week.end)
    if row is None or row["manager_id"] != manager["id"]:
        raise AppError(404, "NOT_FOUND", "Team not found")
    return _team(row)


def team_options(conn: psycopg.Connection, manager: dict[str, Any]) -> TeamOptions:
    """Job titles for the people picker and projects a team can be attached to."""
    return TeamOptions(
        job_titles=users_repo.pickable_job_titles(conn, manager["id"]),
        projects=[TeamProject(**p) for p in repo.manager_project_options(conn, manager["id"])],
    )


def _own_team(conn: psycopg.Connection, manager: dict[str, Any], team_id: int) -> dict[str, Any]:
    team = repo.team(conn, team_id)
    if team is None:
        raise AppError(404, "NOT_FOUND", "Team not found")
    if team["manager_id"] != manager["id"]:
        raise AppError(403, "FORBIDDEN", "You can only change your own teams")
    return team


def _own_project(conn: psycopg.Connection, manager: dict[str, Any], project_id: int) -> dict[str, Any]:
    project = work_repo.project_brief(conn, project_id)
    if project is None or project["is_archived"]:
        raise AppError(404, "NOT_FOUND", "Project not found")
    if project["manager_id"] != manager["id"]:
        raise AppError(403, "FORBIDDEN", "You can only attach teams to projects you manage")
    return project


def _direct_report(conn: psycopg.Connection, manager: dict[str, Any], user_id: int) -> dict[str, Any]:
    """The person as the manager's direct report, taking them on if they were unassigned (400 otherwise)."""
    try:
        person = users_service.ensure_reports_to(conn, manager, user_id)
    except AppError as err:
        if err.status_code != 404:
            raise
        raise _validation({"user_id": "Only active employees can join your teams"}) from None
    return {"id": person["id"], "name": f"{person['first_name']} {person['last_name']}", "email": person["email"], "job_title": person["job_title"]}


def create_team(conn: psycopg.Connection, manager: dict[str, Any], data: TeamCreate) -> Team:
    """Manager creates a team from the employee list, optionally attached to one of their projects."""
    name = data.name.strip()
    if not name:
        raise _validation({"name": "Team name is required"})
    members = [_direct_report(conn, manager, uid) for uid in dict.fromkeys(data.member_ids)]
    project = _own_project(conn, manager, data.project_id) if data.project_id is not None else None

    team_id = repo.insert_team(conn, name, manager["id"])
    for person in members:
        repo.add_member(conn, team_id, person["id"])
    if project:
        repo.attach_project(conn, project["id"], team_id)
    audit.record(
        conn,
        actor_id=manager["id"],
        action="created",
        entity_type="team",
        entity_id=team_id,
        entity_code=_code(team_id),
        summary=f"Created team {name} with {len(members)} {'member' if len(members) == 1 else 'members'}"
        + (f" on {project['code']}" if project else ""),
        details={"after": {"name": name, "members": [p["name"] for p in members], "project": project["code"] if project else None}},
    )
    return get_team(conn, manager, team_id)


def rename_team(conn: psycopg.Connection, manager: dict[str, Any], team_id: int, data: TeamUpdate) -> Team:
    """Manager renames one of their teams."""
    team = _own_team(conn, manager, team_id)
    name = data.name.strip()
    if not name:
        raise _validation({"name": "Team name is required"})
    if name != team["name"]:
        repo.rename_team(conn, team_id, name)
        audit.record(
            conn,
            actor_id=manager["id"],
            action="updated",
            entity_type="team",
            entity_id=team_id,
            entity_code=_code(team_id),
            summary=f"Renamed team {team['name']} to {name}",
            details={"before": {"name": team["name"]}, "after": {"name": name}},
        )
    return get_team(conn, manager, team_id)


def add_member(conn: psycopg.Connection, manager: dict[str, Any], team_id: int, user_id: int) -> Team:
    """Put an employee on the team, taking them on as a direct report if unassigned. 400 if they report elsewhere, 409 if already on it."""
    team = _own_team(conn, manager, team_id)
    person = _direct_report(conn, manager, user_id)
    if repo.is_member(conn, team_id, user_id):
        raise AppError(409, "CONFLICT", f"{person['name']} is already on {team['name']}")
    repo.add_member(conn, team_id, user_id)
    audit.record(
        conn,
        actor_id=manager["id"],
        action="assigned",
        entity_type="team",
        entity_id=team_id,
        entity_code=_code(team_id),
        summary=f"Added {person['name']} to team {team['name']}",
        details={"after": {"member": person["name"], "user_id": user_id}},
    )
    return get_team(conn, manager, team_id)


def remove_member(conn: psycopg.Connection, manager: dict[str, Any], team_id: int, user_id: int) -> None:
    """Take a person off the team (their tasks stay assigned). 404 if they are not on it."""
    team = _own_team(conn, manager, team_id)
    if not repo.is_member(conn, team_id, user_id):
        raise AppError(404, "NOT_FOUND", "This person is not on the team")
    person = users_repo.find_by_id(conn, user_id)
    repo.remove_member(conn, team_id, user_id)
    audit.record(
        conn,
        actor_id=manager["id"],
        action="updated",
        entity_type="team",
        entity_id=team_id,
        entity_code=_code(team_id),
        summary=f"Removed {person['first_name']} {person['last_name']} from team {team['name']}",
        details={"before": {"member": f"{person['first_name']} {person['last_name']}", "user_id": user_id}},
    )


def attach_team(conn: psycopg.Connection, manager: dict[str, Any], project_id: int, team_id: int) -> Team:
    """Attach one of the manager's teams to one of their projects. 409 if already attached."""
    project = _own_project(conn, manager, project_id)
    team = _own_team(conn, manager, team_id)
    if repo.is_attached(conn, project_id, team_id):
        raise AppError(409, "CONFLICT", f"{team['name']} is already working on {project['code']}")
    repo.attach_project(conn, project_id, team_id)
    audit.record(
        conn,
        actor_id=manager["id"],
        action="assigned",
        entity_type="project",
        entity_id=project_id,
        entity_code=project["code"],
        summary=f"Assigned team {team['name']} to {project['name']}",
        details={"after": {"team": team["name"], "team_id": team_id}},
    )
    return get_team(conn, manager, team_id)


def detach_team(conn: psycopg.Connection, manager: dict[str, Any], project_id: int, team_id: int) -> None:
    """Detach a team from a project (existing tasks stay). 404 if it was not attached."""
    project = _own_project(conn, manager, project_id)
    team = _own_team(conn, manager, team_id)
    if not repo.is_attached(conn, project_id, team_id):
        raise AppError(404, "NOT_FOUND", "This team is not on the project")
    repo.detach_project(conn, project_id, team_id)
    audit.record(
        conn,
        actor_id=manager["id"],
        action="updated",
        entity_type="project",
        entity_id=project_id,
        entity_code=project["code"],
        summary=f"Removed team {team['name']} from {project['name']}",
        details={"before": {"team": team["name"], "team_id": team_id}},
    )


# --- Employee ---------------------------------------------------------------------------------


def my_teams(conn: psycopg.Connection, user: dict[str, Any]) -> MyTeams:
    """The employee's teams: each project's current milestone, their own progress, teammates' progress."""
    week = current_week()
    active = work_repo.active_milestone_of(conn, user["id"])
    manager = users_repo.find_by_id(conn, user["manager_id"]) if user.get("manager_id") else None
    teams = []
    for row in repo.teams_of_member(conn, user["id"], week.start, week.end):
        project_rows = overview_repo.project_rows(conn, project_ids=[p["id"] for p in row["projects"]]) if row["projects"] else []
        teams.append(
            MyTeam(
                id=row["id"],
                code=row["code"],
                name=row["name"],
                manager_name=row["manager_name"],
                manager_email=row["manager_email"],
                members=[
                    Teammate(
                        id=m["id"],
                        name=m["name"],
                        job_title=m["job_title"],
                        is_me=m["id"] == user["id"],
                        progress=progress(m["tasks_completed"], m["tasks_total"]),
                    )
                    for m in repo.member_progress(conn, row["id"])
                ],
                projects=[_my_project(conn, user, p, active) for p in project_rows],
            )
        )
    return MyTeams(
        manager=ManagerCard(id=manager["id"], name=f"{manager['first_name']} {manager['last_name']}", email=manager["email"], job_title=manager["job_title"])
        if manager
        else None,
        active_milestone_id=active["id"] if active else None,
        teams=teams,
    )


def _my_project(conn: psycopg.Connection, user: dict[str, Any], project: dict[str, Any], active: dict[str, Any] | None) -> MyTeamProject:
    ms = repo.current_milestone(conn, project["id"])
    mine = repo.my_milestone_figures(conn, user["id"], ms["id"]) if ms else None
    return MyTeamProject(
        id=project["id"],
        code=project["code"],
        name=project["name"],
        department=project["department"],
        health=health(project),
        end_date=project["end_date"],
        milestone=CurrentMilestone(
            id=ms["id"],
            sequence=ms["sequence"],
            name=ms["name"],
            status=ms["status"],
            locked=ms["locked"],
            projected_end_date=ms["projected_end_date"],
            progress=progress(ms["tasks_completed"], ms["tasks_total"]),
        )
        if ms
        else None,
        my_progress=progress(mine["tasks_completed"], mine["tasks_total"]) if mine else progress(0, 0),
        my_hours=mine["actual_hours"] if mine else 0.0,
        my_planned_hours=mine["planned_hours"] if mine else 0.0,
        is_active=bool(active and ms and active["id"] == ms["id"]),
    )
