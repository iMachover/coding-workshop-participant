"""SQL for the manager's Reports page. Read-only; project figures come from the overview query."""

from datetime import date
from typing import Any

import psycopg


def weekly_cost(conn: psycopg.Connection, manager_id: int, first_week_start: date, last_week_end: date) -> list[dict[str, Any]]:
    """Hours and labour cost logged on the manager's active projects, per week (Monday start)."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT date_trunc('week', te.work_date)::date AS week_start,
                   sum(te.hours)::float8 AS hours,
                   sum(te.hours * u.hourly_rate)::float8 AS cost
            FROM time_entries te
            JOIN users u ON u.id = te.user_id
            JOIN tasks t ON t.id = te.task_id
            JOIN milestones m ON m.id = t.milestone_id
            JOIN projects p ON p.id = m.project_id
            WHERE p.manager_id = %s AND p.status = 'active' AND NOT p.is_archived
              AND te.work_date BETWEEN %s AND %s
            GROUP BY 1
            ORDER BY 1
            """,
            (manager_id, first_week_start, last_week_end),
        )
        return cur.fetchall()
