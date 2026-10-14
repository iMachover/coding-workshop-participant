"""HTTP routes for teams (manager) and My teams (employee). Rules live in the service."""

from typing import Any

import psycopg
from fastapi import APIRouter, Depends, Response

from app.core.deps import require_roles
from app.db.connection import get_db
from app.teams import service
from app.teams.schemas import MyTeams, Team, TeamCreate, TeamOptions, TeamUpdate

router = APIRouter(tags=["teams"])

Manager = Depends(require_roles("manager"))


@router.get("/teams", response_model=list[Team])
def list_teams(manager: dict[str, Any] = Manager, db: psycopg.Connection = Depends(get_db)) -> list[Team]:
    """The manager's teams with members, projects and hours this week."""
    return service.list_teams(db, manager)


@router.get("/teams/options", response_model=TeamOptions)
def team_options(manager: dict[str, Any] = Manager, db: psycopg.Connection = Depends(get_db)) -> TeamOptions:
    """Direct reports who can join a team and projects a team can be attached to."""
    return service.team_options(db, manager)


@router.get("/teams/{team_id}", response_model=Team)
def read_team(team_id: int, manager: dict[str, Any] = Manager, db: psycopg.Connection = Depends(get_db)) -> Team:
    """One of the manager's teams."""
    return service.get_team(db, manager, team_id)


@router.post("/teams", response_model=Team, status_code=201)
def create_team(data: TeamCreate, manager: dict[str, Any] = Manager, db: psycopg.Connection = Depends(get_db)) -> Team:
    """Manager creates a team from direct reports, optionally on one of their projects."""
    return service.create_team(db, manager, data)


@router.patch("/teams/{team_id}", response_model=Team)
def rename_team(team_id: int, data: TeamUpdate, manager: dict[str, Any] = Manager, db: psycopg.Connection = Depends(get_db)) -> Team:
    """Rename one of the manager's teams."""
    return service.rename_team(db, manager, team_id, data)


@router.post("/teams/{team_id}/members/{user_id}", response_model=Team)
def add_member(team_id: int, user_id: int, manager: dict[str, Any] = Manager, db: psycopg.Connection = Depends(get_db)) -> Team:
    """Put a direct report on the team. 400 unless they report to this manager."""
    return service.add_member(db, manager, team_id, user_id)


@router.delete("/teams/{team_id}/members/{user_id}", status_code=204)
def remove_member(team_id: int, user_id: int, manager: dict[str, Any] = Manager, db: psycopg.Connection = Depends(get_db)) -> Response:
    """Take a person off the team."""
    service.remove_member(db, manager, team_id, user_id)
    return Response(status_code=204)


@router.post("/projects/{project_id}/teams/{team_id}", response_model=Team)
def attach_team(project_id: int, team_id: int, manager: dict[str, Any] = Manager, db: psycopg.Connection = Depends(get_db)) -> Team:
    """Attach one of the manager's teams to one of their projects."""
    return service.attach_team(db, manager, project_id, team_id)


@router.delete("/projects/{project_id}/teams/{team_id}", status_code=204)
def detach_team(project_id: int, team_id: int, manager: dict[str, Any] = Manager, db: psycopg.Connection = Depends(get_db)) -> Response:
    """Detach a team from a project."""
    service.detach_team(db, manager, project_id, team_id)
    return Response(status_code=204)


@router.get("/me/teams", response_model=MyTeams)
def my_teams(employee: dict[str, Any] = Depends(require_roles("employee")), db: psycopg.Connection = Depends(get_db)) -> MyTeams:
    """The employee's teams, each project's current milestone and teammates' progress."""
    return service.my_teams(db, employee)
