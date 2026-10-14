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
| Seed: 7 accounts plus sample departments, projects, teams, tasks, hours and audit history | Done ([LOGIN.md](LOGIN.md)) |
| App shell: sidebar, top bar, page header, role-based routes | Done |
| Overview page for each role (read-only, real data) | Done; its action buttons come with later slices |
| Employee pages and API: My projects, My teams, My hours, Settings | Next ([EMPLOYEE.md](EMPLOYEE.md)) |
| Manager pages and API beyond Overview | Not started ([MANAGER.md](MANAGER.md)) |
| Admin pages and API beyond Overview | Not started ([ADMIN.md](ADMIN.md)) |
| Deployed and checked on LocalStack / AWS | Not yet |

### API endpoints so far

| Method | Path | Who |
|--------|------|-----|
| POST | `/auth/login` | anyone |
| GET | `/me` | any signed-in user |
| GET | `/users` | admin |
| GET | `/me/overview` | employee |
| GET | `/manager/overview?project_id=` | manager |
| GET | `/admin/overview` | admin |
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
│       │   └── overview/          # Overview page, one version per role
│       ├── components/            # ProtectedRoute, stat cards, status chips, banners, meters,
│       │                          #   side panel, table toolbar, person cell, empty state
│       ├── hooks/                 # useApiGet (load one API path)
│       ├── utils/format.js        # Money, hours and date formatting
│       ├── context/               # AuthProvider (signed-in user, login, logout), ToastProvider
│       └── services/              # API client and auth calls
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
cd backend/api && .venv/bin/python -m pytest   # 84 tests, needs PostgreSQL (see backend README)
cd frontend && npm run lint && npm run build
```

## Design references

- Role specs: [EMPLOYEE.md](EMPLOYEE.md), [MANAGER.md](MANAGER.md), [ADMIN.md](ADMIN.md)
- UI prototype (source of truth for layout, wording and behaviour; rebuilt here in MUI):
  [assets/acme-react-handoff/](assets/acme-react-handoff/), screenshots in `assets/{admin,manager,employee}/`
- Database ER diagram and schema (private artifact, shared by its owner):
  https://claude.ai/artifact/KmULYg6BtBBdedS25Mtr5Z
- Workshop rules: [WORKSHOP_GUIDELINES.md](WORKSHOP_GUIDELINES.md),
  [WORKSHOP_NOTES.md](WORKSHOP_NOTES.md), [FLOWS_INSTRUCTIONS.md](FLOWS_INSTRUCTIONS.md)
