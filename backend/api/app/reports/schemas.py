"""Response models for the manager's Reports page (MANAGER.md §6.4)."""

from datetime import date

from pydantic import BaseModel

from app.overview.schemas import Progress, Week


class ReportTotals(BaseModel):
    """Across every active project the manager owns."""

    projects: int
    at_risk: int
    budget: float
    planned_cost: float
    actual_cost: float
    budget_remaining: float
    budget_used_percent: int
    planned_hours: float
    actual_hours: float
    hours_remaining: float
    hours_used_percent: int


class ProjectReport(BaseModel):
    """One row of "Hours by project"."""

    id: int
    code: str
    name: str
    health: str
    department: str
    end_date: date
    planned_hours: float
    actual_hours: float
    hours_used_percent: int
    planned_cost: float
    actual_cost: float
    budget: float
    budget_used_percent: int
    progress: Progress


class WeeklyCost(BaseModel):
    """Hours and labour cost logged on the manager's projects in one Monday-to-Sunday week."""

    week_start: date
    hours: float
    cost: float


class OverAllocated(BaseModel):
    """A direct report above the 40 h weekly capacity."""

    id: int
    name: str
    hours_this_week: float
    over_by: float


class PlanningNote(BaseModel):
    """The project that most needs attention: budget use running ahead of delivery."""

    id: int
    code: str
    name: str
    health: str
    budget_used_percent: int
    delivery_percent: int
    budget_remaining: float
    hours_remaining: float


class ManagerReports(BaseModel):
    """GET /manager/reports."""

    week: Week
    totals: ReportTotals
    projects: list[ProjectReport]
    weekly_cost: list[WeeklyCost]
    over_allocated: list[OverAllocated]
    attention: PlanningNote | None = None
