"""Response models for the Overview pages. Money is in dollars, hours in hours."""

from datetime import date, datetime

from pydantic import BaseModel


class Progress(BaseModel):
    """Completed out of total tasks."""

    completed: int
    total: int
    percent: int


class Week(BaseModel):
    """Monday to Sunday containing today, with the fixed weekly capacity."""

    start: date
    end: date
    capacity_hours: float


class AuditEntry(BaseModel):
    """One audit log row with the actor's name."""

    id: int
    created_at: datetime
    actor_name: str
    action: str
    entity_type: str
    entity_code: str | None = None
    summary: str


# --- Employee ---------------------------------------------------------------------------------


class EmployeeStats(BaseModel):
    """The employee's four stat cards."""

    project_count: int
    departments: list[str]
    managers: list[str]
    hours_this_week: float
    cost_this_week: float
    hourly_rate: float
    tasks: Progress
    tasks_submitted: int


class NextMilestone(BaseModel):
    """The milestone after the active one; locked until the active one is approved."""

    name: str
    projected_end_date: date | None = None
    locked: bool


class ActiveMilestone(BaseModel):
    """The milestone holding the employee's current work, with their hours and cost in it."""

    id: int
    name: str
    project_code: str
    project_name: str
    team_names: str | None = None
    manager_name: str
    health: str
    due_date: date | None = None
    next_task_due: date | None = None
    progress: Progress
    my_actual_hours: float
    my_planned_hours: float
    my_actual_cost: float
    my_planned_cost: float
    next_milestone: NextMilestone | None = None


class AssignedTask(BaseModel):
    """One open task with its display state (blocked / queued are derived)."""

    id: int
    code: str
    title: str
    project_id: int
    project_code: str
    project_name: str
    milestone_name: str
    status: str
    display_status: str
    due_date: date | None = None
    actual_hours: float
    planned_hours: float
    actual_cost: float
    planned_cost: float


class ResourceSnapshot(BaseModel):
    """The employee's logged hours and cost this week and in total."""

    hours_this_week: float
    available_hours: float
    lifetime_hours: float
    lifetime_cost: float


class EmployeeOverview(BaseModel):
    """GET /me/overview."""

    week: Week
    stats: EmployeeStats
    active_milestone: ActiveMilestone | None = None
    tasks: list[AssignedTask]
    snapshot: ResourceSnapshot


# --- Manager ----------------------------------------------------------------------------------


class ProjectOption(BaseModel):
    """An entry in the manager's project selector."""

    id: int
    code: str
    name: str


class MilestoneCard(BaseModel):
    """One step of the milestone sequence."""

    id: int
    sequence: int
    name: str
    status: str
    locked: bool
    start_date: date | None = None
    projected_end_date: date | None = None
    completed_at: datetime | None = None
    progress: Progress


class FocusProject(BaseModel):
    """The project in focus: figures, health and milestone sequence."""

    id: int
    code: str
    name: str
    description: str | None = None
    health: str
    end_date: date
    manager_name: str
    team_names: list[str]
    progress: Progress
    budget: float
    planned_cost: float
    actual_cost: float
    remaining_budget: float
    budget_used_percent: int
    planned_hours: float
    actual_hours: float
    hours_used_percent: int
    milestones: list[MilestoneCard]


class ManagerStats(BaseModel):
    """The manager's project and approval counts."""

    active_projects: int
    on_track: int
    at_risk: int
    pending_approvals: int


class ReviewItem(BaseModel):
    """A submitted task waiting for the manager's review."""

    id: int
    code: str
    title: str
    employee_name: str
    project_code: str
    milestone_name: str
    submitted_at: datetime | None = None
    actual_hours: float
    planned_hours: float
    actual_cost: float


class PersonCapacity(BaseModel):
    """A direct report's hours this week against capacity, and task progress."""

    id: int
    name: str
    job_title: str | None = None
    team_names: str | None = None
    hours_this_week: float
    over_capacity: bool
    progress: Progress


class ManagerOverview(BaseModel):
    """GET /manager/overview."""

    week: Week
    projects: list[ProjectOption]
    stats: ManagerStats
    focus: FocusProject | None = None
    review_queue: list[ReviewItem]
    people: list[PersonCapacity]


# --- Admin ------------------------------------------------------------------------------------


class AdminStats(BaseModel):
    """Organization-wide totals for the admin's stat cards."""

    active_projects: int
    on_track: int
    at_risk: int
    portfolio_budget: float
    actual_cost: float
    actual_hours: float
    planned_hours: float
    active_people: int
    managers: int


class PortfolioProject(BaseModel):
    """One row of the admin's portfolio table."""

    id: int
    code: str
    name: str
    department: str
    manager_name: str
    health: str
    progress: Progress
    actual_cost: float
    budget: float
    end_date: date


class ManagerCoverage(BaseModel):
    """A manager's active project count and the budget they own."""

    id: int
    name: str
    active_projects: int
    budget_owned: float


class AdminOverview(BaseModel):
    """GET /admin/overview."""

    stats: AdminStats
    portfolio: list[PortfolioProject]
    managers: list[ManagerCoverage]
    recent_audit: list[AuditEntry]
