"""
Idempotent development seed.

Creates the accounts and sample data the role flows need until the admin and
manager flows exist (EMPLOYEE.md §8). Every record is only inserted when it is
missing (users by username, departments by prefix, projects by code, teams by
name and manager; the sample audit history only goes into an empty audit log),
so re-running on every cold start is cheap and never overwrites real data. Dev passwords are listed in backend/api/README.md;
change them before any shared deployment.

Sample dates are relative to the day the seed first runs, so a fresh database
always has a project in flight and a week of logged hours.
"""

import logging
from datetime import date, datetime, timedelta, timezone

import psycopg
from psycopg.types.json import Jsonb

from app.core.security import hash_password

logger = logging.getLogger(__name__)

SEED_DEPARTMENTS: list[dict] = [
    # next_project_seq continues after the seeded project codes (INF-024, OPS-018).
    {"prefix": "INF", "department_name": "Infrastructure", "next_project_seq": 25},
    {"prefix": "OPS", "department_name": "Operations", "next_project_seq": 19},
]

# username (6 chars), password, first, last, email, job title, role, hourly rate, department prefix.
# The literal passwords are development-only seed credentials (bandit B105 is suppressed per line).
SEED_USERS: list[dict] = [
    {
        "username": "adm001",
        "password": "Admin123!",  # nosec B105
        "first_name": "Ada",
        "last_name": "Admin",
        "email": "ada.admin@acme.test",
        "job_title": "System Administrator",
        "role": "admin",
        "hourly_rate": 0,
        "manager_username": None,
        "department": None,
    },
    {
        "username": "mgr001",
        "password": "Manager123!",  # nosec B105
        "first_name": "Morgan",
        "last_name": "Lee",
        "email": "morgan.lee@acme.test",
        "job_title": "Infrastructure Manager",
        "role": "manager",
        "hourly_rate": 85,
        "manager_username": None,
        "department": "INF",
    },
    {
        "username": "mgr002",
        "password": "Manager123!",  # nosec B105
        "first_name": "Taylor",
        "last_name": "Brooks",
        "email": "taylor.brooks@acme.test",
        "job_title": "Operations Manager",
        "role": "manager",
        "hourly_rate": 80,
        "manager_username": None,
        "department": "OPS",
    },
    {
        "username": "emp001",
        "password": "Employee123!",  # nosec B105
        "first_name": "Sam",
        "last_name": "Rivera",
        "email": "sam.rivera@acme.test",
        "job_title": "Systems Engineer",
        "role": "employee",
        "hourly_rate": 60,
        "manager_username": "mgr001",
        "department": "INF",
    },
    {
        "username": "emp002",
        "password": "Employee123!",  # nosec B105
        "first_name": "Priya",
        "last_name": "Natarajan",
        "email": "priya.natarajan@acme.test",
        "job_title": "Network Engineer",
        "role": "employee",
        "hourly_rate": 65,
        "manager_username": "mgr001",
        "department": "INF",
    },
    {
        "username": "emp003",
        "password": "Employee123!",  # nosec B105
        "first_name": "Jordan",
        "last_name": "Okafor",
        "email": "jordan.okafor@acme.test",
        "job_title": "Datacenter Technician",
        "role": "employee",
        "hourly_rate": 45,
        "manager_username": "mgr001",
        "department": "INF",
    },
    {
        "username": "emp004",
        "password": "Employee123!",  # nosec B105
        "first_name": "Casey",
        "last_name": "Nguyen",
        "email": "casey.nguyen@acme.test",
        "job_title": "Inventory Analyst",
        "role": "employee",
        "hourly_rate": 50,
        "manager_username": "mgr002",
        "department": "OPS",
    },
    {
        # Reports to nobody yet: a manager takes them on from the employee list (My team).
        "username": "emp005",
        "password": "Employee123!",  # nosec B105
        "first_name": "Alex",
        "last_name": "Kim",
        "email": "alex.kim@acme.test",
        "job_title": "Storage Engineer",
        "role": "employee",
        "hourly_rate": 48,
        "manager_username": None,
        "department": "INF",
    },
]

# Dates are day offsets from today. Time entries are (weekdays ago, hours).
# Task statuses respect the domain rules: each employee has at most one active milestone,
# and hours are only logged on tasks that were started.
SEED_PROJECTS: list[dict] = [
    {
        "code": "INF-024",
        "name": "Legacy server retirement",
        "description": "Move remaining workloads off the 2014 server fleet and retire the hardware.",
        "department": "INF",
        "manager": "mgr001",
        "start": -56,
        "end": 84,
        "budget": 120000,
        "milestones": [
            {
                "name": "Inventory and dependency mapping",
                "description": "Catalogue every legacy server and what depends on it.",
                "start": -56,
                "end": -28,
                "predicted_hours": 60,
                "status": "completed",
                "tasks": [
                    {
                        "title": "Catalogue legacy servers",
                        "assignee": "emp001",
                        "predicted_hours": 20,
                        "due": -35,
                        "status": "completed",
                        "time": [(25, 6), (24, 7), (23, 5)],
                    },
                    {
                        "title": "Map application dependencies",
                        "assignee": "emp002",
                        "predicted_hours": 24,
                        "due": -30,
                        "status": "completed",
                        "time": [(22, 8), (21, 8), (20, 6)],
                    },
                    {
                        "title": "Confirm data retention requirements",
                        "assignee": "emp003",
                        "predicted_hours": 16,
                        "due": -30,
                        "status": "completed",
                        "time": [(24, 8), (23, 6)],
                    },
                ],
            },
            {
                "name": "Workload migration",
                "description": "Move file services and network endpoints to the new cluster.",
                "start": -27,
                "end": 21,
                "predicted_hours": 100,
                "status": "in_progress",
                "notes": [
                    ("emp001", "File services are about 80% moved. Two shares need owner sign-off before cutover."),
                    ("mgr001", "Chasing the share owners today. Hold the cutover until they confirm."),
                ],
                "tasks": [
                    {
                        "title": "Migrate file services to new cluster",
                        "assignee": "emp001",
                        "predicted_hours": 40,
                        "due": 7,
                        "status": "in_progress",
                        "time": [(5, 6), (4, 7.5), (3, 8), (2, 5), (1, 6.5)],
                        "resources": [
                            {"name": "Migration tool licence", "quantity": 1, "estimated_cost": 1200},
                            {
                                "name": "Temporary storage array",
                                "quantity": 1,
                                "estimated_cost": 3500,
                                "actual_cost": 3350,
                            },
                        ],
                    },
                    {
                        "title": "Update runbooks for migrated services",
                        "assignee": "emp001",
                        "predicted_hours": 12,
                        "due": 14,
                        "status": "assigned",
                    },
                    {
                        "title": "Cut over DNS and load balancer",
                        "assignee": "emp002",
                        "predicted_hours": 24,
                        "due": 3,
                        "status": "submitted",
                        "time": [(3, 7), (2, 8), (1, 6)],
                    },
                    {
                        "title": "Validate backups after migration",
                        "assignee": "emp003",
                        "predicted_hours": 16,
                        "due": 18,
                        "status": "assigned",
                    },
                ],
            },
            {
                "name": "Decommission and disposal",
                "description": "Wipe, certify and recycle the retired hardware.",
                "start": 22,
                "end": 84,
                "predicted_hours": 50,
                "status": "not_started",
                "tasks": [
                    {
                        "title": "Wipe and certify drives",
                        "assignee": "emp003",
                        "predicted_hours": 30,
                        "due": 60,
                        "status": "assigned",
                        "resources": [{"name": "Drive shredding service", "quantity": 1, "estimated_cost": 2400}],
                    },
                    {
                        "title": "Remove racks and arrange recycling",
                        "assignee": "emp002",
                        "predicted_hours": 20,
                        "due": 80,
                        "status": "assigned",
                        "resources": [{"name": "Recycling pickup", "quantity": 1, "estimated_cost": 600}],
                    },
                ],
            },
        ],
    },
    {
        "code": "OPS-018",
        "name": "Asset inventory alignment",
        "description": "Reconcile the asset register with what is physically in both datacenters.",
        "department": "OPS",
        "manager": "mgr002",
        "start": -14,
        "end": 45,
        "budget": 45000,
        "milestones": [
            {
                "name": "Physical audit",
                "description": "Scan every asset tag in datacenters A and B.",
                "start": -14,
                "end": 10,
                "predicted_hours": 44,
                "status": "in_progress",
                "tasks": [
                    {
                        "title": "Scan asset tags in datacenter A",
                        "assignee": "emp004",
                        "predicted_hours": 24,
                        "due": 4,
                        "status": "in_progress",
                        "time": [(4, 5), (3, 6), (2, 4), (1, 5)],
                        "resources": [{"name": "Barcode scanners", "quantity": 4, "estimated_cost": 600}],
                    },
                    {
                        "title": "Scan asset tags in datacenter B",
                        "assignee": "emp004",
                        "predicted_hours": 20,
                        "due": 10,
                        "status": "assigned",
                    },
                ],
            },
            {
                "name": "Reconcile asset register",
                "description": "Match scans to the register and resolve differences.",
                "start": 11,
                "end": 45,
                "predicted_hours": 30,
                "status": "not_started",
                "tasks": [
                    {
                        "title": "Reconcile register against scans",
                        "assignee": "emp004",
                        "predicted_hours": 30,
                        "due": 40,
                        "status": "assigned",
                    },
                ],
            },
        ],
    },
]

# Members are the owning manager's direct reports.
SEED_TEAMS: list[dict] = [
    {"name": "Server Ops", "manager": "mgr001", "members": ["emp001", "emp002", "emp003"], "projects": ["INF-024"]},
    {"name": "Asset Control", "manager": "mgr002", "members": ["emp004"], "projects": ["OPS-018"]},
]

# Sample history for the admin Overview and Audit pages, matching the records above.
# Entity keys: project code, username, task title, milestone name or team name. Age is hours ago.
SEED_AUDIT: list[dict] = [
    {
        "actor": "adm001", "action": "created", "entity": ("project", "INF-024"), "age": 56 * 24,
        "summary": "Created project Legacy server retirement",
        "details": {"after": {"name": "Legacy server retirement", "manager": "mgr001", "budget": 110000}},
    },
    {
        "actor": "mgr001", "action": "created", "entity": ("team", "Server Ops"), "age": 55 * 24,
        "summary": "Created team Server Ops with 3 members",
        "details": {"after": {"name": "Server Ops", "members": ["emp001", "emp002", "emp003"]}},
    },
    {
        "actor": "mgr001", "action": "approved", "entity": ("milestone", "Inventory and dependency mapping"),
        "age": 27 * 24,
        "summary": "Approved milestone Inventory and dependency mapping",
        "details": {"before": {"status": "in_progress"}, "after": {"status": "completed"}},
    },
    {
        "actor": "adm001", "action": "created", "entity": ("user", "emp004"), "age": 21 * 24,
        "summary": "Created employee account for Casey Nguyen",
        "details": {"after": {"role": "employee", "department": "OPS", "manager": "mgr002"}},
    },
    {
        "actor": "adm001", "action": "created", "entity": ("project", "OPS-018"), "age": 14 * 24,
        "summary": "Created project Asset inventory alignment",
        "details": {"after": {"name": "Asset inventory alignment", "manager": "mgr002", "budget": 45000}},
    },
    {
        "actor": "adm001", "action": "updated", "entity": ("project", "INF-024"), "age": 48,
        "summary": "Updated project budget from $110,000 to $120,000",
        "details": {"before": {"budget": 110000}, "after": {"budget": 120000}},
    },
    {
        "actor": "emp002", "action": "submitted", "entity": ("task", "Cut over DNS and load balancer"), "age": 24,
        "summary": "Submitted task Cut over DNS and load balancer for review",
        "details": {"before": {"status": "in_progress"}, "after": {"status": "submitted"}},
    },
    {
        "actor": "emp001", "action": "logged_hours", "entity": ("task", "Migrate file services to new cluster"),
        "age": 20,
        "summary": "Logged 6.5 h on Migrate file services to new cluster",
        "details": {"after": {"hours": 6.5}},
    },
    {
        "actor": "mgr001", "action": "noted", "entity": ("milestone", "Workload migration"), "age": 3,
        "summary": "Added a note on milestone Workload migration",
        "details": {},
    },
]


def apply_seed(conn: psycopg.Connection) -> int:
    """Insert any missing seed records. Returns how many users were created."""
    with conn.cursor() as cur:
        departments = _seed_departments(cur)
        users, created_users = _seed_users(cur, departments)
        created_projects = _seed_projects(cur, departments, users)
        created_teams = _seed_teams(cur, users)
        created_audit = _seed_audit(cur, users)
    conn.commit()
    if created_users:
        logger.info("Seeded %d user(s)", created_users)
    if created_projects or created_teams:
        logger.info("Seeded %d sample project(s) and %d team(s)", created_projects, created_teams)
    if created_audit:
        logger.info("Seeded %d audit log entr(ies)", created_audit)
    return created_users


def _seed_departments(cur: psycopg.Cursor) -> dict[str, int]:
    """Insert missing departments. Returns prefix -> id."""
    for dept in SEED_DEPARTMENTS:
        cur.execute(
            """
            INSERT INTO departments (department_name, prefix, next_project_seq)
            VALUES (%s, %s, %s)
            ON CONFLICT DO NOTHING
            """,
            (dept["department_name"], dept["prefix"], dept["next_project_seq"]),
        )
    cur.execute("SELECT prefix, id FROM departments")
    return {row["prefix"]: row["id"] for row in cur.fetchall()}


def _seed_users(cur: psycopg.Cursor, departments: dict[str, int]) -> tuple[dict[str, int], int]:
    """Insert missing users. Returns (username -> id, number created)."""
    cur.execute("SELECT username, id FROM users")
    existing = {row["username"]: row["id"] for row in cur.fetchall()}
    created = 0

    for user in SEED_USERS:
        department_id = departments.get(user["department"]) if user["department"] else None
        if user["username"] in existing:
            # Users seeded before 002 have no department yet; fill it without overwriting a real one.
            cur.execute(
                "UPDATE users SET department_id = %s WHERE id = %s AND department_id IS NULL",
                (department_id, existing[user["username"]]),
            )
            continue
        manager_id = existing.get(user["manager_username"]) if user["manager_username"] else None
        cur.execute(
            """
            INSERT INTO users
                (username, password_hash, first_name, last_name, email,
                 job_title, role, hourly_rate, manager_id, department_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                user["username"],
                hash_password(user["password"]),
                user["first_name"],
                user["last_name"],
                user["email"].lower(),
                user["job_title"],
                user["role"],
                user["hourly_rate"],
                manager_id,
                department_id,
            ),
        )
        existing[user["username"]] = cur.fetchone()["id"]
        created += 1
    return existing, created


def _seed_projects(cur: psycopg.Cursor, departments: dict[str, int], users: dict[str, int]) -> int:
    """Insert each missing project with its milestones, tasks, resources, hours and notes."""
    today = date.today()
    now = datetime.now(timezone.utc)
    created = 0

    for project in SEED_PROJECTS:
        cur.execute("SELECT 1 FROM projects WHERE code = %s", (project["code"],))
        if cur.fetchone():
            continue
        cur.execute(
            """
            INSERT INTO projects
                (code, name, description, department_id, manager_id, start_date, end_date, budget)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                project["code"],
                project["name"],
                project["description"],
                departments[project["department"]],
                users[project["manager"]],
                today + timedelta(days=project["start"]),
                today + timedelta(days=project["end"]),
                project["budget"],
            ),
        )
        project_id = cur.fetchone()["id"]

        for sequence, milestone in enumerate(project["milestones"], start=1):
            cur.execute(
                """
                INSERT INTO milestones
                    (project_id, name, description, sequence, start_date, projected_end_date,
                     predicted_hours, status, completed_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    project_id,
                    milestone["name"],
                    milestone["description"],
                    sequence,
                    today + timedelta(days=milestone["start"]),
                    today + timedelta(days=milestone["end"]),
                    milestone["predicted_hours"],
                    milestone["status"],
                    now - timedelta(days=27) if milestone["status"] == "completed" else None,
                ),
            )
            milestone_id = cur.fetchone()["id"]

            for task in milestone["tasks"]:
                _seed_task(cur, milestone_id, task, users, today, now)

            for author, text in milestone.get("notes", []):
                cur.execute(
                    "INSERT INTO milestone_notes (milestone_id, user_id, note_text) VALUES (%s, %s, %s)",
                    (milestone_id, users[author], text),
                )
        created += 1
    return created


def _seed_task(cur: psycopg.Cursor, milestone_id: int, task: dict, users: dict[str, int], today: date, now: datetime) -> None:
    """Insert one task with a generated TSK code, plus its resources and time entries."""
    status = task["status"]
    started_at = now - timedelta(days=40 if status == "completed" else 8) if status != "assigned" else None
    submitted_at = now - timedelta(days=30 if status == "completed" else 1) if status in ("submitted", "completed") else None
    completed_at = now - timedelta(days=28) if status == "completed" else None

    cur.execute("SELECT nextval('task_code_seq') AS n")
    code = f"TSK-{cur.fetchone()['n']:03d}"
    assignee_id = users[task["assignee"]]
    cur.execute(
        """
        INSERT INTO tasks
            (code, milestone_id, assigned_to, title, predicted_hours, due_date,
             status, started_at, submitted_at, completed_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (
            code,
            milestone_id,
            assignee_id,
            task["title"],
            task["predicted_hours"],
            today + timedelta(days=task["due"]),
            status,
            started_at,
            submitted_at,
            completed_at,
        ),
    )
    task_id = cur.fetchone()["id"]

    for resource in task.get("resources", []):
        cur.execute(
            """
            INSERT INTO task_resources (task_id, name, quantity, estimated_cost, actual_cost)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (task_id, resource["name"], resource["quantity"], resource["estimated_cost"], resource.get("actual_cost")),
        )

    for weekdays_ago, hours in task.get("time", []):
        cur.execute(
            "INSERT INTO time_entries (task_id, user_id, work_date, hours) VALUES (%s, %s, %s, %s)",
            (task_id, assignee_id, _weekdays_before(today, weekdays_ago), hours),
        )


def _seed_teams(cur: psycopg.Cursor, users: dict[str, int]) -> int:
    """Insert missing teams with their members and project links."""
    created = 0
    for team in SEED_TEAMS:
        manager_id = users[team["manager"]]
        cur.execute("SELECT 1 FROM teams WHERE name = %s AND manager_id = %s", (team["name"], manager_id))
        if cur.fetchone():
            continue
        cur.execute("INSERT INTO teams (name, manager_id) VALUES (%s, %s) RETURNING id", (team["name"], manager_id))
        team_id = cur.fetchone()["id"]
        for member in team["members"]:
            cur.execute("INSERT INTO team_members (team_id, user_id) VALUES (%s, %s)", (team_id, users[member]))
        cur.execute(
            """
            INSERT INTO project_teams (project_id, team_id)
            SELECT id, %s FROM projects WHERE code = ANY(%s)
            """,
            (team_id, team["projects"]),
        )
        created += 1
    return created


def _seed_audit(cur: psycopg.Cursor, users: dict[str, int]) -> int:
    """Insert the sample history, but only into an empty audit log so real history is never mixed in."""
    cur.execute("SELECT 1 FROM audit_log LIMIT 1")
    if cur.fetchone():
        return 0
    now = datetime.now(timezone.utc)
    created = 0
    for entry in SEED_AUDIT:
        entity = _resolve_audit_entity(cur, *entry["entity"])
        if entity is None:
            continue
        cur.execute(
            """
            INSERT INTO audit_log
                (actor_user_id, action, entity_type, entity_id, entity_code, summary, details, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                users[entry["actor"]],
                entry["action"],
                entry["entity"][0],
                entity[0],
                entity[1],
                entry["summary"],
                Jsonb(entry["details"]),
                now - timedelta(hours=entry["age"]),
            ),
        )
        created += 1
    return created


def _resolve_audit_entity(cur: psycopg.Cursor, entity_type: str, key: str) -> tuple[int, str] | None:
    """(id, display code) of a seeded record, or None if it is missing."""
    queries = {
        "project": "SELECT id, code FROM projects WHERE code = %s",
        "user": "SELECT id, 'USR-' || lpad(id::text, 3, '0') AS code FROM users WHERE username = %s",
        "task": "SELECT id, code FROM tasks WHERE title = %s ORDER BY id LIMIT 1",
        "milestone": (
            "SELECT m.id, p.code FROM milestones m JOIN projects p ON p.id = m.project_id "
            "WHERE m.name = %s ORDER BY m.id LIMIT 1"
        ),
        "team": "SELECT id, 'TEAM-' || lpad(id::text, 2, '0') AS code FROM teams WHERE name = %s ORDER BY id LIMIT 1",
    }
    cur.execute(queries[entity_type], (key,))
    row = cur.fetchone()
    return (row["id"], row["code"]) if row else None


def _weekdays_before(day: date, count: int) -> date:
    """The date `count` weekdays before `day` (Saturday and Sunday are skipped)."""
    while count:
        day -= timedelta(days=1)
        if day.weekday() < 5:
            count -= 1
    return day
