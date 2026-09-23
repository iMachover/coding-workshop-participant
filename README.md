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

The app runs at http://localhost:3000. To point it at the local backend, create `frontend/.env.development.local` containing:

```
VITE_API_URL=http://localhost:8000
```

## Testing

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
