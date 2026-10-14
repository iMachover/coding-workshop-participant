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
│   └── users/             # GET /me
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
three Overview endpoints (figures, role access, health and display states).
Override the database with `POSTGRES_*` variables.

Postman: import `postman/project-tracker-api.postman_collection.json`, set
`baseUrl`, run **Login** first.

Security scan (same as CI): `bandit -r ./backend` from the repository root.
