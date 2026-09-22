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
| `IS_LOCAL` | `true` | Turns on local CORS. Terraform sets it to `false` in AWS. |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated list of browser origins allowed locally |
| `POSTGRES_HOST` / `_NAME` / `_USER` / `_PASS` | `localhost` / `codingworkshop` / `test` / `test` | Database connection settings |

CORS is only enabled locally. In AWS, the frontend and the API are served from the same CloudFront domain, so the browser doesn't need CORS.

## Deployment

See [bin/README.md](bin/README.md). The deploy scripts change real AWS resources, so check before running them.
