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
| `components/` | Shared UI: app header and layout, route guards (`ProtectedRoute roles={[...]}` shows a "You don't have access to this" page to other roles), `ErrorState`, `Panel`, `BackLink`; `dashboard/`, `tickets/` and `admin/` hold feature pieces. `PriorityChip` is for staff screens only: employee pages never show priority. |
| `services/` | All API calls. `apiClient.js` is the only place that uses `fetch`. |
| `auth/` | `AuthProvider` + `useAuth()`: the signed-in user, sign in/out, and sign-out when the API rejects the token (expired, forged, or the role changed). The access token lives in `services/session.js` (localStorage) and `apiClient.js` sends it as `Authorization: Bearer <token>`. |
| `hooks/` | `useApiData` (loads data, cancels outdated requests, retry), `useMyTickets`, `useAllTickets` (admin), `useDebouncedValue` (search waits 300 ms after typing), `useIsMobile` (react-responsive) |
| `utils/` | Pure helpers: form validation, ticket labels and formatting, dashboard counts, the workflow (Blocked is a side state off In Progress, not a step), and each role's label and start page (`roles.js`) |
| `frontend/e2e/` (outside `src/`) | Playwright end-to-end tests (see Testing) |
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
| `test_tokens.py` | Signing and verifying access tokens: expiry, tampering, unsigned tokens, the `JWT_SECRET` rules (no DB) |
| `test_auth.py`, `test_locations.py` | Register, login, Bearer tokens (missing, invalid, expired, deleted user, changed role), location lookups |
| `test_roles.py` | The `roles` table: new users get `employee`, unknown roles are rejected, and `schema.sql` moves an older database's `users.role` text into `role_id` |
| `test_rbac.py` | Every non-public route needs sign-in (read from the app's routes, so new ones are covered); `/tickets` is employee-only (403 for engineers and admins); `/admin` is admin-only (403 for employees and engineers); shared routes work for every role |
| `test_admin_tickets.py` | The admin's all-tickets list: triage order (P1 first, then longest-waiting), every filter and search, 422s; details with priority and requester contact; reading any ticket's notes and history; 404s |
| `test_admin_assignment.py` | Assigning and reassigning: acknowledged once, `assigned_at` moves, status and history untouched, 409 for finished tickets or the same engineer, 400 for non-engineers, 404, 422. Engineer workload: only active tickets count, by status and P1, lightest first |
| `test_tickets.py`, `test_ticket_actions.py` | Create, list/filter/search, details, notes, escalation, and one employee never seeing another's tickets |
| `test_status_history.py` | Creating a ticket records it as opened, a reopened ticket keeps every step in order, the table's constraints, and `schema.sql` backfilling tickets made before the history existed |

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

### End-to-end tests

Playwright drives a real Chrome through the app, against a real backend and Postgres. It starts its own backend (port 8100) and frontend (port 3100), so servers you already have running are left alone. It uses its own database, `codingworkshop_e2e`, which is rebuilt from `backend/core/sql/` before every run. Create it once:

```sh
psql -d postgres -c "CREATE DATABASE codingworkshop_e2e OWNER test;"
```

Then:

```sh
cd frontend
npm run e2e
```

It needs Google Chrome installed. To use Playwright's own Chromium instead, run `npx playwright install chromium` and set `E2E_BROWSER_CHANNEL=chromium`. On failure, a trace and an HTML report are saved: run `npx playwright show-report`.

| Spec | Covers |
|---|---|
| `employee-journey.spec.js` | The critical path: register → sign in → create a ticket (Building → Floor → Seat) → add a note → escalate → dashboard and search → sign out. Also checks that no tickets API response carries `priority`. |
| `access-and-edge-cases.spec.js` | Another employee's ticket shows "Ticket not found", a blocked ticket shows the engineer's reason, form errors from the client and the API, a stale session, an engineer landing on their own workspace (and never calling the tickets API), and the phone layout |
| `admin-journey.spec.js` | A Facility Admin signs in to `/admin` → the unassigned queue (priority, escalated) → search and filter all tickets in triage order → an escalated ticket's details (requester, reason, read-only notes) → back. Also: employees can't open the admin pages, and the admin pages fit a phone. Roles are set with SQL (`setRole` in `e2e/helpers.js`), since no API promotes users yet. |

### Manual checks with curl

For every route with its headers, request body, example response and errors, see [postman_testing.md](postman_testing.md). To test every route at once, import [postman_collection.json](postman_collection.json) into Postman and click **Run collection**, or run `npx newman run postman_collection.json`. The quick curl versions follow. With the backend running, run these in another terminal.

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

Log in. The response has a signed access token (valid for 1 hour) and the user.

```sh
curl -X POST http://localhost:8000/api/core/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"jane.doe@acme.inc","password":"hunter2hunter2"}'
# 200 {"access_token":"eyJ...","token_type":"bearer","expires_in":3600,"user":{"user_id":1,...}}
# Wrong email or password: 401 {"detail":"Invalid email or password"}
```

Every other route needs that token as `Authorization: Bearer <token>`. Save it in a shell variable so the examples below can use it:

```sh
TOKEN=$(curl -s -X POST http://localhost:8000/api/core/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"jane.doe@acme.inc","password":"hunter2hunter2"}' \
  | python3 -c 'import json, sys; print(json.load(sys.stdin)["access_token"])')
```

Who am I? Every protected route reads the caller from the token, then reloads them from the database.

```sh
curl http://localhost:8000/api/core/auth/me -H "Authorization: Bearer $TOKEN"
# 200 {"user_id":1,"email":"jane.doe@acme.inc",...}
```

| Problem | Status and `detail` |
|---|---|
| No `Authorization` header, or not `Bearer <token>` | 401 `Please sign in to continue.` |
| Token malformed, tampered with, or signed with another secret | 401 `Invalid token. Please sign in again.` |
| Token older than 1 hour | 401 `Your session has expired. Please sign in again.` |
| The account was deleted, or its role changed since sign-in | 401 `Unknown user` / `Your access has changed. Please sign in again.` |
| Valid token, but the role may not use the route (engineers and admins on `/tickets`, employees and engineers on `/admin`) | 403 `You don't have access to this.` |

Locations for the create-ticket dropdowns (Building → Floor → Seat). Any signed-in role may read them.

```sh
curl http://localhost:8000/api/core/buildings -H "Authorization: Bearer $TOKEN"
# [{"building_id":1,"building_name":"Building A"},...]
curl http://localhost:8000/api/core/buildings/1/floors -H "Authorization: Bearer $TOKEN"
# [{"floor_id":1,"floor_number":1,"building_id":1},...]
curl http://localhost:8000/api/core/floors/3/seats -H "Authorization: Bearer $TOKEN"
# [{"seat_id":3,"seat_number":"301","floor_id":3},...]
# Unknown building or floor: 404. Non-numeric id: 422.
```

Create a ticket (employees only). The server sets `status` to `open` and the creator from the token. It also stores an internal `priority` from `affected_scope` (building → P1, floor → P2, me → P3) for engineers and admins; employee responses never include it.

```sh
curl -X POST http://localhost:8000/api/core/tickets -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Wi-Fi keeps dropping","short_description":"Disconnects every few minutes",
       "description":"Since this morning my laptop loses Wi-Fi every 5-10 minutes.",
       "category":"network","urgency":"medium","affected_scope":"me",
       "building_id":1,"floor_id":3,"seat_id":3}'
# 201 {"ticket_id":1,...,"urgency":"medium","affected_scope":"me","status":"open",...}
```

| Problem | Status |
|---|---|
| `affected_scope` is `floor` without `floor_id`, or `me` without `seat_id`, or `seat_id` without `floor_id` | 422 |
| Unknown category/urgency/scope, blank title | 422 |
| Floor not in the building, seat not on the floor, unknown building/floor/seat | 400 |

List my tickets, most recently updated first. Only the caller's own tickets are returned, with building name and floor/seat numbers filled in.

```sh
curl 'http://localhost:8000/api/core/tickets' -H "Authorization: Bearer $TOKEN"
curl 'http://localhost:8000/api/core/tickets?view=active&urgency=high' -H "Authorization: Bearer $TOKEN"
curl 'http://localhost:8000/api/core/tickets?q=printer' -H "Authorization: Bearer $TOKEN"
```

| Query param | Values |
|---|---|
| `view` | `active` (everything not closed) or `closed` |
| `status` | `open`, `in_progress`, `blocked`, `resolved`, `closed` |
| `urgency` | `low`, `medium`, `high` |
| `q` | Case-insensitive text in title or short description, or an exact ticket id |

Filters combine with AND. An unknown value, or an unknown parameter such as `priority`, returns 422.

Ticket details: the full ticket plus `building_name`, `floor_number`, `seat_number` and `assigned_to_name`.

```sh
curl http://localhost:8000/api/core/tickets/1 -H "Authorization: Bearer $TOKEN"
# 200 {"ticket_id":1,...,"building_name":"Building A","floor_number":3,"seat_number":"301","assigned_to_name":"Sam Tech"}
# Someone else's ticket, or one that doesn't exist: 404 {"detail":"Ticket not found"}
```

Notes. Adding one also moves the ticket's `updated_at` forward, so it rises to the top of the list.

```sh
curl http://localhost:8000/api/core/tickets/1/notes -H "Authorization: Bearer $TOKEN"
# 200 [{"note_id":2,"author_name":"Sam Tech","author_role":"engineer","note_text":"...",...},...] oldest first
curl -X POST http://localhost:8000/api/core/tickets/1/notes -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"note_text":"Thanks, I will be at my desk after 2pm."}'
# 201 {"note_id":3,...}. Closed ticket: 409. Blank note: 422. Not your ticket: 404.
```

Status history: every status the ticket has been in, oldest first, with who changed it. The first row is its creation (`from_status: null`), so a reopen shows up as `resolved` → `open`.

```sh
curl http://localhost:8000/api/core/tickets/1/history -H "Authorization: Bearer $TOKEN"
# 200 [{"history_id":7,"from_status":null,"to_status":"open","changed_by_name":"Jane Doe","changed_by_role":"employee","reason":null,...}]
# Not your ticket: 404.
```

Request escalation. It flags the ticket for Facility Admin review and returns the updated ticket.

```sh
curl -X POST http://localhost:8000/api/core/tickets/5/escalation -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"reason":"Whole floor can not print payroll docs, due today."}'
# 200 {"ticket_id":5,...,"escalation_requested":true,"escalation_reason":"Whole floor can not print..."}
# Already escalated or closed: 409. Blank reason: 422. Not your ticket: 404.
```

#### Facility Admin: all tickets

Admins only; `$ADMIN_TOKEN` is an admin's login token. There's no API to promote a user yet, so set their `role_id` in SQL first (see Known limitations).

List every ticket, whoever created it. Sorted for triage: priority first (P1, P2, P3), then the oldest created first. Each row is the employee list row plus `priority`, `created_by_user_id`, `created_by_name`, `assigned_to_user_id` and `assigned_to_name`.

```sh
curl 'http://localhost:8000/api/core/admin/tickets' -H "Authorization: Bearer $ADMIN_TOKEN"
# 200 [{"ticket_id":3,"title":"Lobby lights out",...,"priority":"P1","created_by_name":"Jane Doe","assigned_to_user_id":null,"assigned_to_name":null},
#      {"ticket_id":2,"title":"Printer jam",...,"priority":"P2","created_by_name":"Eve Other","assigned_to_user_id":4,"assigned_to_name":"Sam Tech"},...]
curl 'http://localhost:8000/api/core/admin/tickets?assignment=unassigned' -H "Authorization: Bearer $ADMIN_TOKEN"
curl 'http://localhost:8000/api/core/admin/tickets?escalated=true&view=active' -H "Authorization: Bearer $ADMIN_TOKEN"
curl 'http://localhost:8000/api/core/admin/tickets?q=eve%20other' -H "Authorization: Bearer $ADMIN_TOKEN"
```

| Query param | Values |
|---|---|
| `view` | `active` (everything not closed) or `closed` |
| `status` | `open`, `in_progress`, `blocked`, `resolved`, `closed` |
| `priority` | `P1`, `P2`, `P3` |
| `urgency` | `low`, `medium`, `high` |
| `category` | `network`, `hardware`, `printer`, `hvac`, `electrical`, `furniture`, `building_facilities`, `other` |
| `building_id` | A building id |
| `assignment` | `unassigned` (the triage queue) or `assigned` |
| `assigned_to` | An engineer's user id |
| `escalated` | `true` or `false` |
| `q` | Case-insensitive text in title, short description, requester name or requester email, or an exact ticket id |

Filters combine with AND, so `assignment=unassigned&assigned_to=4` is always empty. An unknown value or parameter returns 422.

Ticket details: the employee's details view plus `priority` and the requester's `created_by_name`, `created_by_email` and `created_by_phone`. Any ticket, not just the admin's own.

```sh
curl http://localhost:8000/api/core/admin/tickets/1 -H "Authorization: Bearer $ADMIN_TOKEN"
# 200 {"ticket_id":1,...,"escalation_requested":true,"escalation_reason":"I have client calls all afternoon.",
#      "assigned_to_name":null,"priority":"P3","created_by_name":"Jane Doe","created_by_email":"jane.doe@acme.inc","created_by_phone":"555-0100"}
# Doesn't exist: 404 {"detail":"Ticket not found"}. Non-numeric id: 422.
```

Notes and status history of any ticket, in the same shapes as the employee routes. Read-only: admins can't add notes yet.

```sh
curl http://localhost:8000/api/core/admin/tickets/1/notes -H "Authorization: Bearer $ADMIN_TOKEN"
# 200 [{"note_id":1,"author_name":"Jane Doe","author_role":"employee","note_text":"Still dropping after a restart.",...}]
curl http://localhost:8000/api/core/admin/tickets/1/history -H "Authorization: Bearer $ADMIN_TOKEN"
# 200 [{"history_id":1,"from_status":null,"to_status":"open","changed_by_name":"Jane Doe",...}]
# Doesn't exist: 404.
```

#### Facility Admin: engineers and assigning

Engineers with their workload: active tickets (open, in progress or blocked) split by status, and how many are P1. Lightest load first (then fewer P1s, then name), and engineers with nothing assigned are included.

```sh
curl http://localhost:8000/api/core/admin/engineers -H "Authorization: Bearer $ADMIN_TOKEN"
# 200 [{"user_id":3,"full_name":"Sam Tech","email":"sam.tech@acme.inc","active_count":0,"open_count":0,"in_progress_count":0,"blocked_count":0,"p1_count":0},
#      {"user_id":4,"full_name":"Kim Fixit",...,"active_count":1,"open_count":1,"in_progress_count":0,"blocked_count":0,"p1_count":1}]
```

Assign or reassign a ticket. It sets the engineer and `assigned_at`. The first assignment also sets `acknowledged_at`, which a reassignment keeps. Status doesn't change: the engineer moves it to In Progress. Returns the updated ticket in the admin details shape. No status history row is written, since the status is unchanged.

```sh
curl -X PUT http://localhost:8000/api/core/admin/tickets/1/assignment -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' -d '{"engineer_id":3}'
# 200 {"ticket_id":1,...,"status":"open","assigned_to_user_id":3,"assigned_to_name":"Sam Tech",
#      "acknowledged_at":"2026-09-23T14:28:06.138246-04:00","assigned_at":"2026-09-23T14:28:06.138246-04:00","priority":"P1",...}
```

| Problem | Status and `detail` |
|---|---|
| Ticket doesn't exist | 404 `Ticket not found` |
| Ticket is resolved or closed | 409 `Resolved tickets can't be assigned` / `Closed tickets can't be assigned` |
| `engineer_id` isn't a user with the engineer role | 400 `User 1 is not an engineer` |
| Already assigned to that engineer | 409 `This ticket is already assigned to Sam Tech` |
| Missing or non-positive `engineer_id` | 422 |

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
| `JWT_SECRET` | Random per process, locally only | Signs access tokens (HS256). At least 32 characters. **Required in AWS**, where the backend refuses to sign tokens without it. Terraform generates one (`random_password.jwt_secret` in [infra/main.tf](infra/main.tf)) and passes it to every Lambda. |
| `JWT_EXPIRES_MINUTES` | `60` | How long an access token lasts |

CORS is only enabled locally. In AWS, the frontend and the API are served from the same CloudFront domain, so the browser doesn't need CORS.

Without `JWT_SECRET`, the local backend makes up a random secret each time it starts, and `--reload` restarts it on every code change. Each restart signs everyone out ("Invalid token. Please sign in again."). To stay signed in while you work, set a fixed secret in the terminal that runs the backend:

```sh
export JWT_SECRET=$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')
cd backend/core && ../.venv/bin/uvicorn function:app --reload --port 8000
```

In AWS the secret stays the same across deploys. Rotating it signs every user out. To rotate it, replace `random_password.jwt_secret` in a Terraform apply (`-replace=random_password.jwt_secret`), using the same credentials and backend setup as [bin/deploy-backend.sh](bin/deploy-backend.sh).

## Deployment

See [bin/README.md](bin/README.md). The deploy scripts change real AWS resources, so check before running them.

## Known limitations

- **Access tokens in `localStorage`.** The frontend keeps its signed JWT (1 hour, no refresh tokens) in `localStorage` ([frontend/src/services/session.js](frontend/src/services/session.js)) and sends it as `Authorization: Bearer <token>`. A token there could be read by an injected script (XSS); React's output escaping and the short expiry limit that risk.
- List endpoints return every matching record, with no pagination yet.
- The employee side is built; the staff side is in progress. Facility admins have a dashboard (`/admin`: the unassigned queue, plus all tickets with search and filters) and a read-only details page (`/admin/tickets/:id`), but can't act on tickets there yet. With many unassigned tickets the queue section gets long; it isn't paged or capped. Engineers sign in to a placeholder start page (`/engineer`). The API can assign tickets and list engineer workload (`/admin/tickets/{id}/assignment`, `/admin/engineers`); the UI for that comes next. The endpoints for changing status, blocking and closing don't exist yet, and tests stand in for them with SQL. No API can promote a user yet either; set their `role_id` in the `users` table directly, to one of the rows in `roles` (`employee`, `engineer`, `admin`).
- Status history is only written when a ticket is created, since nothing else changes status yet. The engineer and admin endpoints must call `ticket_repository.insert_status_change` in the same transaction as every status update, or the history will miss that step.
- Ticket **priority** (P1/P2/P3) is stored for engineer and admin triage but is not part of the employee API: no employee response includes it and employees can't filter by it. Employees see the urgency and impact they chose, and the status. The admin ticket routes return priority, filter by it and sort by it. Admins can't change it yet.
- Deploy packaging: Terraform builds the Lambda zip with pip on the machine running it (`build_in_docker = false`), so compiled packages (psycopg-binary, pydantic-core) need Linux x86_64 wheels before deploying from a Mac. The zip also includes `backend/core/tests/`, which is harmless.
