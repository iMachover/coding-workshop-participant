# Manual testing: pytest and Postman

Run from `backend/api` unless a step says otherwise.

**Which database login to use**

- Workshop VM: user `postgres`, password `postgres123`.
- Mac with Homebrew Postgres: your Mac login name, no password. There is no `postgres` user.

The commands below show both versions where they differ. Run only the lines for your machine.

## 1. pytest

**Setup, once**

```sh
python3.13 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
```

Then create the test database:

```sh
# Workshop VM
PGPASSWORD=postgres123 createdb -h localhost -U postgres project_tracker_test

# Mac with Homebrew Postgres
# Expected error if already created
createdb project_tracker_test
```

**Run**

```sh
# Workshop VM
.venv/bin/python -m pytest

# Mac with Homebrew Postgres
POSTGRES_USER=$USER POSTGRES_PASS= .venv/bin/python -m pytest
```

**Expected result**

```text
250 passed
```

If any test fails, the output shows which one and why.

**What the tests cover**

Most tests run against the real test database.

| File | Count | What it checks |
| ---- | ----- | -------------- |
| `tests/test_security.py` | 6 | Password hashing. Tokens are rejected if expired, tampered with, unsigned or signed with another secret. |
| `tests/test_auth_api.py` | 15 | `/auth/login` and `/me`: wrong password, unknown user, missing fields, archived users blocked, bad or missing tokens, the error format. |
| `tests/test_roles.py` | 5 | Role checks, for example only an admin can list users. |
| `tests/test_schema.py` | 9 | Database rules: an end date can't be before the start date, a project needs a manager, hours must be positive, deletes cascade or are blocked as intended. |
| `tests/test_seed.py` | 8 | The sample data is consistent. Seeding again adds nothing, and audit entries point at records that exist. |
| `tests/test_overview.py` | 36 | The three Overview pages: project health rules, cost = hours × rate, people over 40 hours flagged, and what each role can see. |
| `tests/test_projects.py` | 25 | The Projects API: what each role can see, admin-only create, archive and restore, manager edit limits, validation, and audit entries. |
| `tests/test_work.py` | 16 | Tasks and milestones: forward-only status, one active milestone, review, approval, notes, close project. |
| `tests/test_people.py` | 28 | People and teams: paginated people list, create with generated username (employees start unassigned), validation, role-change and archive blockers, last-admin rule, manager's direct reports, taking an unassigned employee on and releasing them (directly or through a team), teams (create, rename, members, attach and detach), employee My teams. Cleans up what it creates. |
| `tests/test_hours.py` | 28 | My hours: the week's ledger and explicit ranges, logging hours only on own tasks in progress or submitted (no future dates, 0 < hours ≤ 24, at most 24 h a day), corrections (no audit row when nothing changed), removals, the `editable` flag, who reads a task's entries. Cleans up what it creates. |
| `tests/test_audit.py` | 14 | Audit activity and Archives (admin only): the log newest first, pagination, search on summary, record code or actor, action / record type / actor / date filters (end before start is a 400), the filter values, the before / after diff of an update, unknown entry, archived projects and users together with who archived them, type filter and search, and a restored record leaving the list. Cleans up what it creates. |
| `tests/test_reports.py` | 11 | Manager reports: manager only, totals and per-project figures equal to the Projects list and the Overview, the five-week labour cost series (Monday starts, ending this week, hours × rate checked against the database), over-allocated people once someone passes 40 h, and the planning note (the project with tasks, null for a manager without projects). Cleans up what it creates. |
| `tests/test_settings.py` | 44 | Settings: anyone changes their own name and email through `PATCH /me` (trimmed, email lower-cased and unique, blank names and bad emails rejected, no audit row without a change, 401 without a token); departments listed by every role with people and active project counts, admin-only create and rename (three-letter prefix upper-cased and unique, names unique ignoring case, 403 for others, 404 unknown, audit before / after), and a project created in a new department getting its prefix. Cleans up what it creates. |
| `tests/test_lambda_handler.py` | 5 | The Lambda entry point strips the CloudFront path prefix. |

**Common errors**

- `database "project_tracker_test" already exists`: the database was created before. Skip that step.
- `role "postgres" does not exist`: you are on a Mac with Homebrew Postgres. Use the Mac commands.
- `password authentication failed` or `database ... does not exist`: the database setup step is missing or the credentials differ. Use `POSTGRES_USER=... POSTGRES_PASS=...` to override them.

## 2. Postman

**Setup, once**

1. Install the Postman app.
2. Import `postman/project-tracker-api.postman_collection.json`.

**Start the API and seed the database**

```sh
# Workshop VM
export JWT_SECRET=dev POSTGRES_USER=postgres POSTGRES_PASS=postgres123

# Mac with Homebrew Postgres
export JWT_SECRET=dev

.venv/bin/python -m app.db.bootstrap
.venv/bin/uvicorn app.main:app --reload --port 8000
```

Run the `export` line and both commands in the same terminal window. The API will not start without `JWT_SECRET`. On a Mac, the API logs in to Postgres as your Mac user by default, so no database settings are needed.

**Set the base URL**

1. Open the collection variables.
2. Set `baseUrl` to `http://localhost:8000`. The default points at LocalStack on port 3001.

**Run**

1. Click the collection, then **Run**.
2. Run the whole collection, so the login requests run before the others.
3. Check that every test passes.

**Expected result**

187 requests. Every test passes.

The collection creates and archives a project, creates a person (archived and restored) and a
team, logs, corrects and removes a time entry, and archives and restores a second project while
reading the audit log and the archives, and creates and renames a department ("Postman dept <timestamp>" with a
prefix derived from the clock, so reruns do not collide). If a second run gives different results, reset the local database and run again.

**Test logins**

| Username | Password     | Role     |
| -------- | ------------ | -------- |
| emp001   | Employee123! | Employee |
| mgr001   | Manager123!  | Manager  |
| adm001   | Admin123!    | Admin    |
