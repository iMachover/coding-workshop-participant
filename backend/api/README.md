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
│   │   ├── seed.py        # Idempotent dev users
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
tasks with resources, a week of logged hours, and a milestone note thread.
Sample dates are relative to the day the seed first runs.

## Run locally without LocalStack

```sh
cd backend/api
python3.13 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
createdb project_tracker            # once
export JWT_SECRET=local-dev-secret POSTGRES_NAME=project_tracker
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
users, role checks, the error envelope, and the Lambda path normalisation.
Override the database with `POSTGRES_*` variables.

Postman: import `postman/project-tracker-api.postman_collection.json`, set
`baseUrl`, run **Login** first.

Security scan (same as CI): `bandit -r ./backend` from the repository root.
