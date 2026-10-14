# ACME Project Tracker

A web app that gives ACME visibility into project progress, people's workload and budgets. Admins
set up departments, people and projects. Managers plan milestones and tasks, build teams and review
work. Employees log hours and move their tasks forward. The business problem is in
[WORKSHOP_GUIDELINES.md](WORKSHOP_GUIDELINES.md).

This README is kept current: every change that adds, renames or removes a feature updates it.

## Status

The build tracker for the remaining work is [BUILD_PLAN.md](BUILD_PLAN.md).

| Area | State |
|------|-------|
| Login with JWT, roles `admin` / `manager` / `employee` | Done |
| Database: all 13 tables (migrations 001 and 002) | Done |
| Seed: 8 accounts plus sample departments, projects, teams, tasks, hours and audit history | Done ([LOGIN.md](LOGIN.md)) |
| App shell: sidebar, top bar, page header, role-based routes | Done |
| Overview page for each role (read-only, real data) | Done; its action buttons come with later slices |
| Projects page and API for all roles (list, detail, create, edit, archive) | Done ([BUILD_PLAN.md](BUILD_PLAN.md) slice 2) |
| Tasks and milestones: start/submit, review, plan tasks, add and approve milestones, notes, close project | Done (slice 3) |
| People & access (admin): create accounts, edit, role change, archive and restore | Done (slice 4) |
| My team (manager): take employees on from the employee list, release them, teams (searchable, filtered by project), members, attach teams to projects | Done (slice 4) |
| My teams (employee): team table with state and health filters, team panel with manager, milestones and teammates | Done (slice 4) |
| My hours (employee) | Next (slice 5, [EMPLOYEE.md](EMPLOYEE.md)) |
| Audit activity, Archives (admin); Reports (manager); Settings (all) | Later (slices 6 to 8) |
| Deployed and checked on LocalStack / AWS | Not yet |

### API endpoints so far

| Method | Path | Who |
|--------|------|-----|
| POST | `/auth/login` | anyone |
| GET | `/me` | any signed-in user |
| GET | `/users?q&role&department_id&archived&page&limit` | admin: paginated people list with role counts |
| GET | `/users/options` | admin: managers and departments for the person form |
| GET | `/users/{id}` | admin: profile with projects, teams, hours, cost and archive blockers |
| POST | `/users` | admin: create an account; the 6-character username is generated |
| PATCH | `/users/{id}` | admin: any field but the username; 409 when a role change is blocked |
| POST | `/users/{id}/archive`, `/restore` | admin: 409 with the blockers (own account, last admin, active projects, reports, open tasks) |
| GET | `/employees`, `/employees/{id}` | manager: direct reports and one report's profile |
| PATCH | `/employees/{id}` | manager: first name, last name, email of a direct report |
| POST | `/employees/{id}/assign`, `/release` | manager: take an unassigned employee on as a direct report (400 if another manager's), or release one to the pool and off their teams (409 while they have open tasks) |
| GET | `/teams`, `/teams/{id}`, `/teams/options` | manager: own teams with members and projects; job titles for the people picker and which projects |
| GET | `/employees/search?q&job_title&exclude_team_id` | manager: people picker, first 25 of their own and unassigned employees (never another manager's), minus a team's members |
| POST | `/teams` | manager: create a team (name, member_ids, project_id) |
| PATCH | `/teams/{id}` | manager: rename |
| POST, DELETE | `/teams/{id}/members/{user_id}` | manager: add a member (an unassigned employee becomes a direct report; 400 if another manager's) or remove one |
| POST, DELETE | `/projects/{id}/teams/{team_id}` | manager: attach or detach one of their teams to one of their projects |
| GET | `/me/teams` | employee: teams, each project's current milestone, own and teammates' progress |
| GET | `/me/overview` | employee |
| GET | `/manager/overview?project_id=` | manager |
| GET | `/admin/overview` | admin |
| GET | `/projects?q&archived` | any signed-in user; admin sees all, manager own, employee joined (`/me/projects` alias) |
| GET | `/projects/{id}` | same scope; 404 outside it |
| GET | `/projects/options` | admin: managers and departments for the form |
| POST | `/projects` | admin |
| PATCH | `/projects/{id}` | admin (any field incl. manager); manager (name, description, dates, budget of own) |
| POST | `/projects/{id}/archive`, `/restore` | admin |
| GET | `/tasks/{id}` | employee (own), manager (own projects), admin |
| PATCH | `/tasks/{id}` | employee: `{status: in_progress \| submitted}`, forward only; 409 if the milestone is locked or another milestone is active |
| POST | `/tasks/{id}/complete`, `/reopen` | manager of the project |
| GET | `/milestones/{id}` | anyone on the project: tasks (employee: own), notes, approval state |
| POST | `/projects/{id}/milestones` | manager: next milestone in sequence |
| POST | `/milestones/{id}/tasks` | manager: assignee must be on a team attached to the project |
| POST | `/milestones/{id}/approve` | manager: 409 unless every task is completed |
| POST | `/milestones/{id}/notes` | employee or manager on the project |
| POST | `/projects/{id}/close` | manager: 409 unless every milestone is approved |
| GET | `/health` | anyone |

## Tech stack

- **Frontend:** React 19, React Router 7, Material UI 6, Vite (`frontend/`)
- **Backend:** Python, FastAPI on one AWS Lambda through Mangum (`backend/api/`)
- **Database:** PostgreSQL, plain numbered SQL migrations
- **Infrastructure:** Terraform for LocalStack and AWS (`infra/`), scripts in `bin/`

## Repository layout

```
├── README.md              # This file
├── BUILD_PLAN.md          # Build tracker: slices, checklists, decisions
├── LOGIN.md               # Dev accounts and how login works
├── EMPLOYEE.md            # Employee role spec: flows, tables, pages, API, build checklist (§9)
├── MANAGER.md             # Manager role spec
├── ADMIN.md               # Admin role spec
├── assets/                # Page mockups per role (PNG); see note below
├── backend/api/           # The API: app/, db/migrations/, tests/, postman/
├── frontend/              # React app
│   └── src/
│       ├── config/navigation.js   # Each role's pages; also the route allow-list
│       ├── layout/                # AppShell, Sidebar, TopBar, Footer, PageHeader
│       ├── config/statuses.js     # Labels and colours for task, milestone and health states
│       ├── pages/                 # Login, placeholder, no-access, not-found pages
│       │   ├── overview/          # Overview page, one version per role
│       │   ├── projects/          # Projects page, project side panel, create/edit form
│       │   ├── work/              # Milestone and task side panels, mounted once in the shell
│       │   ├── people/            # People & access (admin), person profile panel, person form, credentials dialog
│       │   ├── team/              # My team (manager) and its team panel
│       │   └── teams/             # My teams (employee)
│       ├── components/            # ProtectedRoute, stat cards, status chips, banners, meters,
│       │                          #   side panel, table toolbar, person cell, empty state
│       ├── hooks/                 # useApiGet (load one API path), usePanelParams (side panels in the URL)
│       ├── utils/format.js        # Money, hours and date formatting
│       ├── context/               # AuthProvider (signed-in user, login, logout), ToastProvider, RefreshProvider
│       └── services/              # API client, auth calls, project, workflow and people/team writes
├── infra/                 # Terraform
├── bin/                   # Start, deploy and setup scripts
└── docs/                  # Workshop guides
```

`assets/` is currently ignored by `.gitignore`, so the mockups exist only on the machine that has
them.

## Running it

**Whole stack (workshop VM):** `./bin/start-dev.sh` starts PostgreSQL, LocalStack, deploys the
Lambda with Terraform and runs the frontend at http://localhost:3000. The API is reachable through
the proxy at `http://localhost:3001/api/api/...`. On first request the API applies migrations and
the seed.

**Backend only:** see [backend/api/README.md](backend/api/README.md). In short:

```sh
cd backend/api
python3.13 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
cp .env.sample .env && set -a && . ./.env && set +a
.venv/bin/python -m app.db.bootstrap
.venv/bin/uvicorn app.main:app --reload --port 8000
```

**Frontend only:** `cd frontend && npm install && npm run dev`.

## Configuration

| File | Used by | In git? |
|------|---------|---------|
| `frontend/.env.local` | Vite: `VITE_API_URL`, `VITE_API_ENDPOINTS`. Written by `bin/generate-env.sh` | No, ignored |
| `frontend/.env.sample` | Template for the above | Yes |
| `backend/api/.env` | Local API runs: `JWT_SECRET`, `POSTGRES_*`, `CORS_ORIGINS` | No, ignored |
| `backend/api/.env.sample` | Template for the above | Yes |

Deployed Lambdas don't read `.env` files. Terraform sets their variables in `infra/locals.tf`,
including a generated `JWT_SECRET`. `.gitignore` ignores every `.env` and `.env.*` file except
`.env.sample`.

## Access control

Three roles, enforced in two places:

1. **API (the real protection).** Every protected endpoint uses `get_current_user` or
   `require_roles(...)` from `backend/api/app/core/deps.py`. Requests without a valid token get 401;
   the wrong role gets 403. Each request re-reads the user, so archiving someone cuts off access at
   once. Endpoints also scope data to the caller, for example an employee only gets their own tasks.
2. **Frontend (convenience).** `frontend/src/config/navigation.js` lists the pages for each role. The
   sidebar shows only those, and `ProtectedRoute` shows a "no access" page if someone opens another
   role's URL. This hides what a user can't use but secures nothing by itself; the API decides.

## Tests and checks

```sh
cd backend/api && .venv/bin/python -m pytest   # 150 tests, needs PostgreSQL (see backend README)
cd frontend && npm run lint && npm run build
cd frontend && npm run test:e2e                # Playwright, needs the dev stack running (see frontend/e2e/README.md)
```

## Design references

- Role specs: [EMPLOYEE.md](EMPLOYEE.md), [MANAGER.md](MANAGER.md), [ADMIN.md](ADMIN.md)
- UI prototype (source of truth for layout, wording and behaviour; rebuilt here in MUI):
  [assets/acme-react-handoff/](assets/acme-react-handoff/), screenshots in `assets/{admin,manager,employee}/`
- Database ER diagram and schema (private artifact, shared by its owner):
  https://claude.ai/artifact/KmULYg6BtBBdedS25Mtr5Z
- Workshop rules: [WORKSHOP_GUIDELINES.md](WORKSHOP_GUIDELINES.md),
  [WORKSHOP_NOTES.md](WORKSHOP_NOTES.md), [FLOWS_INSTRUCTIONS.md](FLOWS_INSTRUCTIONS.md)
