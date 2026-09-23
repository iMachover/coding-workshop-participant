# Facilities Helpdesk

Ticketing app for reporting and resolving facility issues. Frontend: React + Vite. Backend: FastAPI on AWS Lambda. Database: PostgreSQL.

## Local development

Run all commands from the repo root.

### One-time setup

The backend needs Python 3.13, which matches the Lambda runtime. The macOS system `python3` is too old for FastAPI.

```sh
python3.13 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/core/requirements-dev.txt
cd frontend && npm install
```

### Database

The backend uses a local PostgreSQL 17. The role and database below match the defaults in `config.py`.

```sh
brew install postgresql@17
brew services start postgresql@17
psql -d postgres -c "CREATE ROLE test LOGIN PASSWORD 'test';"
psql -d postgres -c "CREATE DATABASE codingworkshop OWNER test;"
```

Create the tables and load the demo buildings, floors and seats. Both files are safe to re-run.

```sh
PGPASSWORD=test psql -h localhost -U test -d codingworkshop \
  -f backend/core/sql/schema.sql -f backend/core/sql/seed.sql
```

To start over with empty tables, run `backend/core/sql/reset.sql` first, then the command above. It deletes all data and refuses to run against anything but a local server.

### Run the backend

```sh
cd backend/core && ../.venv/bin/uvicorn function:app --reload --port 8000
```

You should see `Uvicorn running on http://127.0.0.1:8000`. Every route is served under `/api/core`, the same path CloudFront uses in AWS.

### Run the frontend

In a second terminal:

```sh
cd frontend && npm run dev
```

The app runs at http://localhost:3000. It calls the API at relative `/api/core/...` URLs, and the Vite dev server forwards `/api` to the backend on port 8000 (see [frontend/vite.config.js](frontend/vite.config.js)). In AWS, CloudFront does the same on one domain, so no API URL or CORS setup is needed. `VITE_API_URL` can still point the app at another API host if you need to.

Frontend code lives in `frontend/src/`:

| Folder / file | Holds |
|---|---|
| `pages/` | One component per route |
| `components/` | Shared UI: app header and layout, route guards, `ErrorState`; `dashboard/` and `tickets/` hold feature pieces |
| `services/` | All API calls. `apiClient.js` is the only place that uses `fetch`. |
| `auth/` | `AuthProvider` + `useAuth()`: the signed-in user, sign in/out, and sign-out when the API rejects the session. **Dev-only session** (see Known limitations). |
| `hooks/` | `useIsMobile` (react-responsive), `useMyTickets` (loads tickets, cancels outdated requests), `useDebouncedValue` (search waits 300 ms after typing) |
| `utils/` | Pure helpers: form validation, ticket labels and formatting, dashboard counts |
| `theme.js` | MUI theme: Citi light blue `#056DAE`, navy `#003B70` headings, white surfaces |

## Testing

### Running the tests

The pytest suite runs against its own database, `codingworkshop_test`, so your dev data is never touched. Create it once:

```sh
psql -d postgres -c "CREATE DATABASE codingworkshop_test OWNER test;"
```

Then run the suite from `backend/core`, with or without coverage:

```sh
cd backend/core
../.venv/bin/pytest
../.venv/bin/pytest --cov --cov-report=term-missing
```

Each run rebuilds the test schema from `sql/`, and every test starts with no users, tickets or notes. The suite refuses to run against a database whose name doesn't end in `_test`. To use a different test database, set `TEST_POSTGRES_NAME`.

| File | Covers |
|---|---|
| `test_security.py`, `test_schemas.py` | Password hashing and request validation (no DB) |
| `test_db.py` | Commit, rollback, connection reuse and reconnecting after a dropped connection |
| `test_health_and_errors.py` | Health checks, domain errors → 400/401/404/409, generic JSON 500 |
| `test_auth.py`, `test_locations.py` | Register, login, `X-User-Id`, location lookups |
| `test_tickets.py`, `test_ticket_actions.py` | Create, list/filter/search, details, notes, escalation, and one employee never seeing another's tickets |

CI runs `bandit -r ./backend`. `backend/.bandit` skips `tests/` folders there, since tests use `assert` and fake passwords on purpose.

### Frontend tests

Vitest and React Testing Library, with API calls mocked. No backend needed.

```sh
cd frontend
npm test            # run once
npm run test:watch  # re-run on save
npm run coverage    # with a coverage report
npm run lint
```

Tests sit next to the code they cover (`apiClient.test.js` beside `apiClient.js`). `src/test/renderWithProviders.jsx` renders a component with the theme and router at a given URL and screen width, e.g. `{ width: 375 }` for a phone.

### Manual checks with curl

With the backend running, run these in another terminal.

Health check:

```sh
curl http://localhost:8000/api/core/health
# {"status":"ok"}
```

Database check. It returns 503 `{"status":"error","db":"unavailable"}` if Postgres is down, and recovers without a restart once Postgres is back.

```sh
curl http://localhost:8000/api/core/health/db
# {"status":"ok","db":"ok"}
```

Register an employee. Only `@acme.inc` emails are accepted, and passwords need at least 8 characters.

```sh
curl -X POST http://localhost:8000/api/core/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"jane.doe@acme.inc","full_name":"Jane Doe","phone_number":"555-0101","password":"hunter2hunter2"}'
# 201 {"user_id":1,"email":"jane.doe@acme.inc",...,"role":"employee",...}
# Same email again: 409. Non-acme email or short password: 422.
```

Log in. There's no token yet: remember the returned `user_id` and send it as the `X-User-Id` header on later requests.

```sh
curl -X POST http://localhost:8000/api/core/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"jane.doe@acme.inc","password":"hunter2hunter2"}'
# 200 {"user_id":1,...}. Wrong email or password: 401 {"detail":"Invalid email or password"}
```

Who am I? Every protected route reads the caller from `X-User-Id`.

```sh
curl http://localhost:8000/api/core/auth/me -H 'X-User-Id: 1'
# 200 {"user_id":1,"email":"jane.doe@acme.inc",...}
# Missing, non-numeric or unknown id: 401
```

Locations for the create-ticket dropdowns (Building → Floor → Seat). All need `X-User-Id`.

```sh
curl http://localhost:8000/api/core/buildings -H 'X-User-Id: 1'
# [{"building_id":1,"building_name":"Building A"},...]
curl http://localhost:8000/api/core/buildings/1/floors -H 'X-User-Id: 1'
# [{"floor_id":1,"floor_number":1,"building_id":1},...]
curl http://localhost:8000/api/core/floors/3/seats -H 'X-User-Id: 1'
# [{"seat_id":3,"seat_number":"301","floor_id":3},...]
# Unknown building or floor: 404. Non-numeric id: 422.
```

Create a ticket. The server sets `status` to `open`, the creator from `X-User-Id`, and `priority` from `affected_scope` (building → P1, floor → P2, me → P3).

```sh
curl -X POST http://localhost:8000/api/core/tickets -H 'X-User-Id: 1' -H 'Content-Type: application/json' \
  -d '{"title":"Wi-Fi keeps dropping","short_description":"Disconnects every few minutes",
       "description":"Since this morning my laptop loses Wi-Fi every 5-10 minutes.",
       "category":"network","urgency":"medium","affected_scope":"me",
       "building_id":1,"floor_id":3,"seat_id":3}'
# 201 {"ticket_id":1,...,"priority":"P3","status":"open",...}
```

| Problem | Status |
|---|---|
| `affected_scope` is `floor` without `floor_id`, or `me` without `seat_id`, or `seat_id` without `floor_id` | 422 |
| Unknown category/urgency/scope, blank title | 422 |
| Floor not in the building, seat not on the floor, unknown building/floor/seat | 400 |

List my tickets, most recently updated first. Only the caller's own tickets are returned, with building name and floor/seat numbers filled in.

```sh
curl 'http://localhost:8000/api/core/tickets' -H 'X-User-Id: 1'
curl 'http://localhost:8000/api/core/tickets?view=active&urgency=high' -H 'X-User-Id: 1'
curl 'http://localhost:8000/api/core/tickets?q=printer' -H 'X-User-Id: 1'
```

| Query param | Values |
|---|---|
| `view` | `active` (everything not closed) or `closed` |
| `status` | `open`, `in_progress`, `blocked`, `resolved`, `closed` |
| `urgency` | `low`, `medium`, `high` |
| `priority` | `P1`, `P2`, `P3` |
| `q` | Case-insensitive text in title or short description, or an exact ticket id |

Filters combine with AND. An unknown value returns 422.

Ticket details: the full ticket plus `building_name`, `floor_number`, `seat_number` and `assigned_to_name`.

```sh
curl http://localhost:8000/api/core/tickets/1 -H 'X-User-Id: 1'
# 200 {"ticket_id":1,...,"building_name":"Building A","floor_number":3,"seat_number":"301","assigned_to_name":"Sam Tech"}
# Someone else's ticket, or one that doesn't exist: 404 {"detail":"Ticket not found"}
```

Notes. Adding one also moves the ticket's `updated_at` forward, so it rises to the top of the list.

```sh
curl http://localhost:8000/api/core/tickets/1/notes -H 'X-User-Id: 1'
# 200 [{"note_id":2,"author_name":"Sam Tech","author_role":"engineer","note_text":"...",...},...] oldest first
curl -X POST http://localhost:8000/api/core/tickets/1/notes -H 'X-User-Id: 1' -H 'Content-Type: application/json' \
  -d '{"note_text":"Thanks, I will be at my desk after 2pm."}'
# 201 {"note_id":3,...}. Closed ticket: 409. Blank note: 422. Not your ticket: 404.
```

Request escalation. It flags the ticket for Facility Admin review and returns the updated ticket.

```sh
curl -X POST http://localhost:8000/api/core/tickets/5/escalation -H 'X-User-Id: 1' -H 'Content-Type: application/json' \
  -d '{"reason":"Whole floor can not print payroll docs, due today."}'
# 200 {"ticket_id":5,...,"escalation_requested":true,"escalation_reason":"Whole floor can not print..."}
# Already escalated or closed: 409. Blank reason: 422. Not your ticket: 404.
```

CORS allows the frontend origin:

```sh
curl -i http://localhost:8000/api/core/health -H 'Origin: http://localhost:3000'
# HTTP/1.1 200 OK
# access-control-allow-origin: http://localhost:3000
```

CORS blocks other origins:

```sh
curl -i -X OPTIONS http://localhost:8000/api/core/health \
  -H 'Origin: http://evil.test' -H 'Access-Control-Request-Method: POST'
# HTTP/1.1 400 Bad Request
```

## Configuration

The backend reads its settings from environment variables in [backend/core/config.py](backend/core/config.py). Every setting has a local default.

| Variable | Default | Purpose |
|---|---|---|
| `IS_LOCAL` | `true` | Turns on local CORS and turns off Postgres SSL. Terraform sets it to `false` in AWS, where Aurora requires SSL. |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated list of browser origins allowed locally |
| `POSTGRES_HOST` / `_PORT` / `_NAME` / `_USER` / `_PASS` | `localhost` / `5432` / `codingworkshop` / `test` / `test` | Database connection settings |

CORS is only enabled locally. In AWS, the frontend and the API are served from the same CloudFront domain, so the browser doesn't need CORS.

## Deployment

See [bin/README.md](bin/README.md). The deploy scripts change real AWS resources, so check before running them.

## Known limitations

- **Sign-in is temporary and dev-only. It is not real authentication.** Login returns the user, the frontend keeps it in `localStorage` ([frontend/src/services/session.js](frontend/src/services/session.js)), and every request sends its id as the `X-User-Id` header. Anyone can send any id. JWT will replace this: only `session.js`, `apiClient.js` and the backend's `deps.get_current_user` need to change.
- List endpoints return every matching record, with no pagination yet.
- Employees never see a ticket's internal **priority** in the UI; they see the urgency and impact they chose, and the status. The API responses still include `priority`, so it is visible in browser dev tools. Removing it from employee responses is a backend change for when role-based responses are added.
