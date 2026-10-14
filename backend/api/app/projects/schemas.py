"""Request and response models for projects. Money in dollars, hours in hours."""

from datetime import date

from pydantic import BaseModel, Field, field_validator

from app.overview.schemas import MilestoneCard, Progress


class ProjectCreate(BaseModel):
    """Admin creates a project; the code is generated from the department prefix."""

    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    department_id: int
    manager_id: int
    start_date: date
    end_date: date
    budget: float = Field(ge=0)

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Project name is required")
        return value.strip()


class ProjectUpdate(BaseModel):
    """
    Fields a PATCH may change. Admin may set every field; a manager may set only
    name, description, dates and budget on a project they manage (checked in the service).
    """

    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    manager_id: int | None = None
    start_date: date | None = None
    end_date: date | None = None
    budget: float | None = Field(default=None, ge=0)


class MyFigures(BaseModel):
    """The signed-in employee's own hours and cost on a project (EMPLOYEE.md §6.3)."""

    planned_hours: float
    actual_hours: float
    planned_cost: float
    actual_cost: float


class ProjectRow(BaseModel):
    """One project with the figures every role's Projects table shows."""

    id: int
    code: str
    name: str
    description: str | None = None
    department_id: int
    department: str
    manager_id: int
    manager_name: str
    status: str
    is_archived: bool
    health: str
    start_date: date
    end_date: date
    budget: float
    planned_hours: float
    actual_hours: float
    planned_cost: float
    actual_cost: float
    progress: Progress
    team_names: list[str]
    mine: MyFigures | None = None


class ProjectDetail(ProjectRow):
    """A project plus its milestone sequence."""

    milestones: list[MilestoneCard]


class ManagerOption(BaseModel):
    """A manager an admin can assign to a project."""

    id: int
    name: str


class DepartmentOption(BaseModel):
    """A department a project can belong to."""

    id: int
    name: str
    prefix: str
