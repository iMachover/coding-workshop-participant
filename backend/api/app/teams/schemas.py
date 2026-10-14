"""Request and response models for teams (manager) and My teams (employee)."""

from datetime import date

from pydantic import BaseModel, Field

from app.overview.schemas import Progress


class TeamCreate(BaseModel):
    """Manager creates a team, optionally with its first members and a project to work on."""

    name: str = Field(min_length=1, max_length=100)
    member_ids: list[int] = []
    project_id: int | None = None


class TeamUpdate(BaseModel):
    """Rename a team."""

    name: str = Field(min_length=1, max_length=100)


class TeamMember(BaseModel):
    """Someone on a team, with their hours this week."""

    id: int
    name: str
    email: str
    job_title: str | None = None
    hours_this_week: float


class TeamProject(BaseModel):
    """A project the team is attached to."""

    id: int
    code: str
    name: str
    status: str


class Team(BaseModel):
    """A manager's team with its members and projects (the Teams card on My team)."""

    id: int
    code: str
    name: str
    manager_id: int
    members: list[TeamMember]
    projects: list[TeamProject]
    hours_this_week: float


class TeamOptions(BaseModel):
    """Job titles for the people picker's filter, and the projects my teams can work on. People come from GET /employees/search."""

    job_titles: list[str]
    projects: list[TeamProject]


# --- Employee: My teams -----------------------------------------------------------------------


class Teammate(BaseModel):
    """A teammate with their task progress on the team's projects. Never their cost."""

    id: int
    name: str
    job_title: str | None = None
    is_me: bool
    progress: Progress


class CurrentMilestone(BaseModel):
    """The milestone the team is working through on a project."""

    id: int
    sequence: int
    name: str
    status: str
    locked: bool
    projected_end_date: date | None = None
    progress: Progress


class MyTeamProject(BaseModel):
    """One of the team's projects as the employee sees it: current milestone and own progress."""

    id: int
    code: str
    name: str
    department: str
    health: str
    end_date: date
    milestone: CurrentMilestone | None = None
    my_progress: Progress
    my_hours: float
    my_planned_hours: float
    is_active: bool


class MyTeam(BaseModel):
    """A team the employee is on."""

    id: int
    code: str
    name: str
    manager_name: str
    manager_email: str
    members: list[Teammate]
    projects: list[MyTeamProject]


class ManagerCard(BaseModel):
    """The employee's manager, for the side card."""

    id: int
    name: str
    email: str
    job_title: str | None = None


class MyTeams(BaseModel):
    """GET /me/teams."""

    manager: ManagerCard | None = None
    active_milestone_id: int | None = None
    teams: list[MyTeam]
