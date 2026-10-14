"""
Manager reports (MANAGER.md §4 "reports"): totals across the manager's active projects,
hours and cost per project, the weekly labour cost series for the last five weeks,
direct reports above the 40 h capacity, and the project whose budget use runs furthest
ahead of its delivery. Everything is computed on read from the same figures the Overview
and Projects pages use, so the pages agree.
"""

from datetime import timedelta
from typing import Any

import psycopg

from app.overview import repository as overview_repo
from app.overview.service import WEEKLY_CAPACITY_HOURS, current_week, health, progress
from app.reports import repository as repo
from app.reports.schemas import ManagerReports, OverAllocated, PlanningNote, ProjectReport, ReportTotals, WeeklyCost

WEEKS_IN_SERIES = 5


def _money(value: float) -> float:
    return round(value, 2)


def _percent_of(part: float, whole: float) -> int:
    return round(100 * part / whole) if whole else 0


def manager_reports(conn: psycopg.Connection, manager: dict[str, Any]) -> ManagerReports:
    """The Reports page for one manager."""
    week = current_week()
    rows = overview_repo.project_rows(conn, manager_id=manager["id"])
    projects = [_project(r) for r in rows]

    budget = sum(p.budget for p in projects)
    actual_cost = sum(p.actual_cost for p in projects)
    planned_hours = sum(p.planned_hours for p in projects)
    actual_hours = sum(p.actual_hours for p in projects)
    totals = ReportTotals(
        projects=len(projects),
        at_risk=sum(1 for p in projects if p.health == "at_risk"),
        budget=_money(budget),
        planned_cost=_money(sum(p.planned_cost for p in projects)),
        actual_cost=_money(actual_cost),
        budget_remaining=_money(budget - actual_cost),
        budget_used_percent=_percent_of(actual_cost, budget),
        planned_hours=planned_hours,
        actual_hours=actual_hours,
        hours_remaining=max(planned_hours - actual_hours, 0),
        hours_used_percent=_percent_of(actual_hours, planned_hours),
    )

    first_start = week.start - timedelta(weeks=WEEKS_IN_SERIES - 1)
    logged = {r["week_start"]: r for r in repo.weekly_cost(conn, manager["id"], first_start, week.end)}
    series = [
        WeeklyCost(
            week_start=first_start + timedelta(weeks=i),
            hours=logged.get(first_start + timedelta(weeks=i), {}).get("hours", 0.0),
            cost=_money(logged.get(first_start + timedelta(weeks=i), {}).get("cost", 0.0)),
        )
        for i in range(WEEKS_IN_SERIES)
    ]

    over = [
        OverAllocated(
            id=r["id"],
            name=f"{r['first_name']} {r['last_name']}",
            hours_this_week=r["hours_this_week"],
            over_by=r["hours_this_week"] - WEEKLY_CAPACITY_HOURS,
        )
        for r in overview_repo.direct_reports(conn, manager["id"], week.start, week.end)
        if r["hours_this_week"] > WEEKLY_CAPACITY_HOURS
    ]

    return ManagerReports(week=week, totals=totals, projects=projects, weekly_cost=series, over_allocated=over, attention=_attention(projects))


def _project(row: dict[str, Any]) -> ProjectReport:
    return ProjectReport(
        id=row["id"],
        code=row["code"],
        name=row["name"],
        health=health(row),
        department=row["department"],
        end_date=row["end_date"],
        planned_hours=row["planned_hours"],
        actual_hours=row["actual_hours"],
        hours_used_percent=_percent_of(row["actual_hours"], row["planned_hours"]),
        planned_cost=_money(row["planned_cost"]),
        actual_cost=_money(row["actual_cost"]),
        budget=row["budget"],
        budget_used_percent=_percent_of(row["actual_cost"], row["budget"]),
        progress=progress(row["tasks_completed"], row["tasks_total"]),
    )


def _attention(projects: list[ProjectReport]) -> PlanningNote | None:
    """At-risk projects first, then the widest gap between budget used and delivery done (projects with tasks)."""
    if not projects:
        return None
    candidates = [p for p in projects if p.health == "at_risk" or p.progress.total > 0] or projects
    worst = max(candidates, key=lambda p: (p.health == "at_risk", p.budget_used_percent - p.progress.percent))
    return PlanningNote(
        id=worst.id,
        code=worst.code,
        name=worst.name,
        health=worst.health,
        budget_used_percent=worst.budget_used_percent,
        delivery_percent=worst.progress.percent,
        budget_remaining=_money(worst.budget - worst.actual_cost),
        hours_remaining=max(worst.planned_hours - worst.actual_hours, 0),
    )
