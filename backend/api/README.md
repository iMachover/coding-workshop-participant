# Project Tracker API (`backend/api`)

Single Python Lambda (FastAPI + Mangum) that serves the whole Project Tracker
API. Terraform discovers it from `requirements.txt` and deploys it with handler
`function.handler`. Code is organised by domain, each with
`routes → service → repository`:

```
backend/api/
├── function.py            # Lambda entry point (Mangum, strips /api/api prefix)
├── app/
│   ├── main.py            # FastAPI app factory: CORS, error handlers, routers
│   ├── core/
│   │   ├── config.py      # Settings from environment (lazy, cached)
│   │   ├── security.py    # bcrypt hashing, JWT create/decode
│   │   ├── deps.py        # get_current_user, require_roles
│   │   └── errors.py      # AppError + { success:false, error:{...} } envelope
│   ├── db/
│   │   ├── connection.py  # Shared psycopg connection, get_db dependency
│   │   ├── migrations.py  # Applies db/migrations/*.sql (schema_migrations table)
│   │   ├── seed.py        # Idempotent dev users + sample data
│   │   └── bootstrap.py   # CLI: python -m app.db.bootstrap
│   ├── auth/              # POST /auth/login
│   ├── users/             # GET/PATCH /me, admin people management, manager's direct reports
│   ├── overview/          # The three Overview endpoints and the shared project figures query
│   ├── projects/          # Projects CRUD, archive and restore
│   ├── work/              # Tasks, milestones, notes, close project
│   ├── teams/             # Manager teams and the employee's My teams
│   ├── hours/             # Time entries: ledger, log, correct, delete
│   ├── audit/             # Audit activity and Archives (read-only)
│   ├── reports/           # Manager reports (read-only)
│   └── departments/       # Departments: list, create, rename
├── db/migrations/         # Numbered SQL migrations
├── tests/                 # pytest (runs against a real PostgreSQL database)
└── postman/               # Postman collection
```

## Authentication

- `POST /auth/login` with `{ "username", "password" }` returns
  `{ "token", "token_type": "Bearer", "expires_in", "user" }`.
- Every other endpoint requires `Authorization: Bearer <token>`.
- Tokens are HS256 JWTs signed with `JWT_SECRET`, valid for
  `JWT_EXPIRES_MINUTES` (default 480 = one working day). There is no refresh
  token yet: when a token expires the client receives `401 TOKEN_EXPIRED` and
  must log in again.
- Passwords are stored as bcrypt hashes (cost 12). Login failures for an
  unknown user, wrong password or archived account all return the same
  `401 INVALID_CREDENTIALS` so usernames cannot be enumerated.
- `get_current_user` re-reads the user on every request, so archiving a user
  revokes access immediately even if their token is still valid.
- `require_roles("admin", "manager")` is the dependency for role-restricted
  routes (returns `403 FORBIDDEN`). `GET /users` (admin only, lists every
  user) is the first route that uses it.

## Overview endpoints

One call fills each role's Overview page (`app/overview/`). All figures are computed on read:

- `GET /me/overview` (employee): stat cards, the active milestone, open tasks with Blocked /
  Queued display states, this week's and lifetime hours and cost.
- `GET /manager/overview?project_id=` (manager): stat cards, the project in focus (default: the
  first one) with its milestone sequence, the review queue and direct reports' weekly hours.
  `403` if `project_id` is not one of the manager's active projects.
- `GET /admin/overview` (admin): portfolio totals, every active project, manager coverage and
  the latest 4 audit entries.

Health is "at risk" when the active milestone is past its projected end or logged hours exceed
planned hours. Cost is hours × the person's hourly rate plus task resources.

## Project endpoints

| Method | Path | Who |
|--------|------|-----|
| GET | `/projects?q=&archived=` | any signed-in user. Admin: every project (`archived=true` lists archived ones). Manager: projects they manage. Employee: projects they are on through a team or an assigned task, with a `mine` block (their planned/actual hours and cost). Every row carries `team_names` (empty until the manager links a team), `health` and `progress`. |
| GET | `/me/projects` | employee alias of `GET /projects` (EMPLOYEE.md §7) |
| GET | `/projects/{id}` | same scope as the list; 404 outside it. Adds the milestone sequence with lock state. |
| GET | `/projects/options` | admin: active managers and departments for the project form |
| POST | `/projects` | admin. Body: name, description?, department_id, manager_id, start_date, end_date, budget. The code is `PREFIX-NNN` from the department's counter. 400 with `fields` when dates are out of order or the manager is not an active manager. |
| PATCH | `/projects/{id}` | admin: name, description, manager_id, start_date, end_date, budget. Manager: the same minus manager_id, only on their own projects (403 otherwise). Writes an audit row only when something changed. |
| POST | `/projects/{id}/archive`, `/projects/{id}/restore` | admin. 409 if already in that state. Archived projects leave every list except the admin's `archived=true` list. |

Every write records a row in `audit_log` through `app/core/audit.py` (`record` and `changes`).
Health, progress and cost come from the same query the Overview pages use
(`app/overview/repository.py: project_rows`), so every page agrees on the figures.

## Task and milestone endpoints

| Method | Path | Who |
|--------|------|-----|
| GET | `/tasks/{id}` | employee: own tasks; manager: tasks on their projects; admin: all. Returns figures, resources, `display_status` (adds Blocked / Queued) and the actions the viewer may take (`can_start`, `can_submit`, `can_review`, `blocked_reason`). |
| PATCH | `/tasks/{id}` | employee, body `{"status": "in_progress" \| "submitted"}`. Forward only. 409 when the milestone is locked, when another milestone holds the employee's in-progress work (one active milestone), or when the status would go backwards. Starting the first task of a milestone moves it to in_progress. |
| POST | `/tasks/{id}/complete` | manager of the project: submitted → completed |
| POST | `/tasks/{id}/reopen` | manager: submitted or completed → in_progress (clears submitted_at / completed_at). 409 inside an approved milestone. |
| GET | `/milestones/{id}` | anyone on the project (or its manager / admin): milestone, tasks (employee: own only), notes, `can_approve` / `approve_blocker` and `assignable` people for the manager |
| POST | `/projects/{id}/milestones` | manager: appends the next milestone; `sequence` = last + 1 |
| POST | `/milestones/{id}/tasks` | manager: title, description?, predicted_hours, due_date?, assigned_to. 400 unless the assignee is on a team attached to the project. Code `TSK-###`. |
| POST | `/milestones/{id}/approve` | manager: 409 unless the milestone is unlocked and every task is completed; stamps completed_at and unlocks the next |
| POST | `/milestones/{id}/notes` | employee or manager on the project (admins read only) |
| POST | `/projects/{id}/close` | manager: 409 unless every milestone is approved; sets status closed |

## People and team endpoints

| Method | Path | Who |
|--------|------|-----|
| GET | `/users?q=&role=&department_id=&archived=&page=&limit=` | admin. One page (`limit` ≤ 100) of active people, or archived ones with `archived=true`; `q` matches name, email, username or `USR-` code. Each row carries hours this week, `over_capacity` (above 40 h), team names and task progress; the envelope adds `counts` per role. |
| GET | `/users/options` | admin: active managers and departments for the person form |
| GET | `/users/{id}` | admin: the row plus projects (managed or joined), teams, progress by milestone, the latest 10 time entries, lifetime hours and cost, `blockers` and `can_archive` |
| POST | `/users` | admin. Body: first_name, last_name, email, job_title?, role, department_id?, manager_id?, hourly_rate, password (≥ 8). An employee starts unassigned unless `manager_id` names an active manager; managers and admins must not have one. The server generates a unique 6-character `[a-z0-9]` username and returns it in the profile; the admin shows it with the password once. |
| PATCH | `/users/{id}` | admin: any field but the username. A role change is refused (409) while a manager owns active projects or has direct reports, or while an employee has open tasks; moving to manager or admin clears `manager_id`, moving to employee leaves them unassigned unless one is given. Writes an audit row only when something changed. |
| POST | `/users/{id}/archive`, `/users/{id}/restore` | admin. Archiving has the same blockers as a role change, plus: never your own account, never the last active admin. An archived person cannot sign in (401) and leaves every list and picker; `restore` brings them back. 409 if already in that state. |
| GET | `/employees?q=` | manager: active direct reports with the same figures as the admin's rows |
| GET | `/employees/{id}` | manager: a direct report's profile (same shape as `/users/{id}`); 404 for anyone else |
| PATCH | `/employees/{id}` | manager: first_name, last_name, email of a direct report; any other field is 403 |
| POST | `/employees/{id}/assign` | manager: take an unassigned active employee on as a direct report (audit `assigned` on the user). 400 with `fields.user_id` when they report to another manager (an admin moves them), 409 if already a direct report, 404 for non-employees |
| POST | `/employees/{id}/release` | manager: release a direct report (204): `manager_id` cleared and taken off every team the manager owns (audit `unassigned`). 404 unless a direct report, 409 while they have tasks that are not completed |
| GET | `/teams` | manager: own teams with members (and their hours this week), attached projects and the team's hours this week |
| GET | `/teams/{id}` | manager: one own team; 404 otherwise |
| GET | `/employees/search?q=&job_title=&exclude_team_id=` | manager: the people picker. The first 25 (by last name) of the manager's own direct reports and unassigned employees, never another manager's or archived people; `q` matches name or email, `job_title` is exact, `exclude_team_id` hides that team's members. Returns `items` (id, name, email, job_title, manager_id null when unassigned, hours_this_week), `total` matches and `limit`, so the picker says "showing 25 of N" |
| GET | `/teams/options` | manager: `job_titles` (distinct titles among the people they may pick, for the picker's filter) and active projects a team can be attached to |
| POST | `/teams` | manager. Body: name, member_ids? (direct reports or unassigned employees, who become direct reports; 400 if another manager's), project_id? (own project, else 403) |
| PATCH | `/teams/{id}` | manager: rename (403 for another manager's team) |
| POST | `/teams/{id}/members/{user_id}` | manager: add a direct report, or an unassigned employee who becomes one (400 if they report to another manager); 409 if already a member |
| DELETE | `/teams/{id}/members/{user_id}` | manager: remove a member (204); their tasks stay assigned |
| POST | `/projects/{id}/teams/{team_id}` | manager: attach own team to own project (403 otherwise); 409 if already attached. Only members of an attached team can be given tasks on the project. |
| DELETE | `/projects/{id}/teams/{team_id}` | manager: detach (204); existing tasks stay |
| GET | `/me/teams` | employee: their manager, `active_milestone_id`, and each team with its members' progress (never their cost) and each project's current milestone, the employee's own progress and hours in it, and `is_active` when that milestone holds their work in progress |

Codes are display-only: `USR-###` and `TEAM-##` are formatted from the id.

## Time entry endpoints

Hours are logged after the work, never timed (EMPLOYEE.md §2). Cost is hours × the person's
hourly rate at the time of reading.

| Method | Path | Who |
|--------|------|-----|
| GET | `/me/time-entries?from=&to=` | employee. Entries between two dates (default: this week, Monday to Sunday; at most 92 days), newest first, each with `editable`; plus the week's hours and cost, `available_hours` against the 40 h capacity, lifetime figures and `loggable_tasks` (own tasks in progress or submitted on active projects). |
| GET | `/tasks/{id}/time-entries` | employee: own entries on own task (404 otherwise); manager: every entry on a task of their projects; admin: all |
| POST | `/tasks/{id}/time-entries` | employee. Body: work_date, hours (0 < h ≤ 24), note?. 404 unless the task is theirs; 409 while it is still assigned, once completed, or when the project is closed or archived; 400 for a future date or when the day would exceed 24 h in total. Audit `logged_hours` on the task. |
| PATCH | `/time-entries/{id}` | employee: work_date, hours, note of an own entry; same checks; 409 once the task is completed. Audit row only when something changed. |
| DELETE | `/time-entries/{id}` | employee: remove an own entry while the task is not completed (204). Audit `deleted`. |

## Audit and archive endpoints

| Method | Path | Who |
|--------|------|-----|
| GET | `/audit?q=&action=&entity_type=&actor_id=&from=&to=&page=&limit=` | admin. Newest first; `q` matches the summary, the record code or the actor's name; `from` / `to` are inclusive dates. The envelope adds `actions`, `entity_types` and `actors` seen in the log, for the filter dropdowns. |
| GET | `/audit/{id}` | admin: the row, its stored `details` and `changes` (one `{field, before, after}` per field) |
| GET | `/archives?q=&type=&page=&limit=` | admin: archived projects and users in one list, newest archive first (`archived_at` and `archived_by` come from the latest `archived` audit row). `type` is `project` or `user`. Restore with `POST /projects/{id}/restore` or `POST /users/{id}/restore`. |

## Reports endpoint

| Method | Path | Who |
|--------|------|-----|
| GET | `/manager/reports` | manager. `totals` across their active projects (budget, planned and actual cost, remaining, planned and actual hours, remaining); `projects` with hours, cost, budget use and delivery per project; `weekly_cost` for the last five Monday-to-Sunday weeks (Σ hours × rate of entries on their projects); `over_allocated` direct reports above 40 h this week; `attention`, the at-risk project or the one whose budget use runs furthest ahead of delivery. Same figures as the Overview and Projects pages. |

## Settings and department endpoints

| Method | Path | Who |
|--------|------|-----|
| PATCH | `/me` | any signed-in user: first_name, last_name, email (unique, case-insensitive). Nothing else is self-service. Audit row only when something changed. |
| GET | `/departments` | any signed-in user: every department with its prefix, next project number, active people and active projects |
| POST | `/departments` | admin: name (unique) and prefix (exactly three letters, stored upper-case, unique). 400 with `fields` otherwise. |
| PATCH | `/departments/{id}` | admin: name and / or prefix. Existing project codes keep the prefix they were created with. |

### Error format

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "fields": { "password": "Field required" } } }
```

| Status | Codes |
|--------|-------|
| 400 | `VALIDATION_ERROR` |
| 401 | `UNAUTHORIZED`, `INVALID_CREDENTIALS`, `TOKEN_EXPIRED`, `TOKEN_INVALID` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 500 | `INTERNAL_ERROR`, `DATABASE_ERROR` |
| 503 | `DATABASE_UNAVAILABLE` |

## Environment variables

| Variable | Source | Notes |
|----------|--------|-------|
| `JWT_SECRET` | Terraform (`infra/locals.tf`) | Required. Random 64-char value kept in Terraform state, or `TF_VAR_aws_jwt_secret`. |
| `JWT_EXPIRES_MINUTES` | optional | Default `480`. |
| `CORS_ORIGINS` | Terraform (`aws_cors_origins`) | Comma-separated. Default `http://localhost:3000`. |
| `IS_LOCAL`, `POSTGRES_HOST/PORT/NAME/USER/PASS` | Terraform | Same as the example services. `sslmode=require` is added when not local. |

## Paths

CloudFront routes `/api/api/*` to this Lambda without rewriting the path, while
`bin/proxy-server.js` strips `/api/api` locally. `function.py` removes the
prefix when present, so the frontend always calls `${VITE_API_URL}/api/api/...`
and routes are declared once (`/auth/login`, `/me`).

## Database

Migrations live in `db/migrations/NNN_description.sql` and are applied on the
first request of each Lambda container (guarded by an advisory lock), then the
idempotent seed runs. Applied versions are recorded in `schema_migrations`.

Seeded development accounts (change before any shared deployment):

| Username | Password | Role |
|----------|----------|------|
| `adm001` | `Admin123!` | admin |
| `mgr001`, `mgr002` | `Manager123!` | manager |
| `emp001`, `emp002`, `emp003`, `emp004` | `Employee123!` | employee |

`mgr001` manages `emp001`–`emp003` (Infrastructure); `mgr002` manages `emp004`
(Operations). The seed also creates sample data so every page has something to
show: 2 departments, 2 projects (INF-024 under `mgr001` with 3 milestones,
OPS-018 under `mgr002` with 2), a team per manager attached to its project,
tasks with resources, a week of logged hours, a milestone note thread, and a
sample audit history (only written into an empty audit log).
Sample dates are relative to the day the seed first runs.

## Run locally without LocalStack

```sh
cd backend/api
python3.13 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
createdb project_tracker            # once
cp .env.sample .env                 # once; edit POSTGRES_USER/PASS for your machine
set -a && . ./.env && set +a        # load the settings into this shell
.venv/bin/python -m app.db.bootstrap            # apply migrations + seed
.venv/bin/uvicorn app.main:app --reload --port 8000
curl -s -X POST localhost:8000/auth/login -H 'Content-Type: application/json' \
     -d '{"username":"emp001","password":"Employee123!"}'
```

Interactive docs: http://localhost:8000/docs

With LocalStack use `./bin/start-dev.sh` as usual; the API is then at
`http://localhost:3001/api/api/...`.

## Tests

```sh
cd backend/api
python3.13 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
PGPASSWORD=postgres123 createdb -h localhost -U postgres project_tracker_test   # once
.venv/bin/python -m pytest
```

The tests connect to `localhost:5432` as `postgres` / `postgres123`, the
credentials `bin/setup-environment.sh` configures (defaults in
`tests/conftest.py`). If your local PostgreSQL uses different credentials, pass
them in, e.g. `POSTGRES_USER=me POSTGRES_PASS=secret .venv/bin/python -m pytest`.
Every test erroring with `psycopg.OperationalError` (`no password supplied`,
`password authentication failed` or `database "project_tracker_test" does not
exist`) means one of these two steps is missing.

The suite drops and recreates the `project_tracker_test` schema, applies the
migrations and seed, then covers: hashing, token creation/expiry/tampering,
login success and every failure path, `/me` with and without tokens, archived
users, role checks, the error envelope, the Lambda path normalisation, and the
three Overview endpoints (figures, role access, health and display states), the Projects,
task and milestone, and people and team rules.
Override the database with `POSTGRES_*` variables.

Postman: import `postman/project-tracker-api.postman_collection.json`, set
`baseUrl`, run **Login** first.

Security scan (same as CI): `bandit -r ./backend` from the repository root.
