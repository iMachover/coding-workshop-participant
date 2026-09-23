# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this repo is

A participant starter kit for a timed coding workshop. The participant builds an app for a business problem the organizers send by email. The canonical example is ACME Inc.'s team-management tool: teams, members, locations, monthly achievements, metadata, auth and RBAC, CRUD, search and filter, and a responsive UI. The required stack is **React + Material UI** for the frontend, **Python** for the backend and **PostgreSQL** for the database. It deploys to AWS Serverless (S3, CloudFront, Lambda, Aurora) with Terraform, driven by shell scripts in `bin/`.

Work is scored on implementation, design, code quality, testing and developer experience. Read [docs/full-stack.md](docs/full-stack.md) for the rubric, the expected REST endpoints and status codes, RBAC roles (Admin, Manager, Contributor, Viewer) and coverage targets (80%+ components, 90%+ CRUD endpoints). Other roles have their own guides in `docs/`: data engineer, AI FDE, system engineer and UI/UX.

Almost everything here is scaffolding. The participant's real work goes in new folders under `backend/`, in `frontend/src/{pages,components,services}` (empty `.gitkeep` placeholders for now) and, for data roles, under `data/`.

## Layout

- `backend/<service>/`: one AWS Lambda per folder, auto-discovered by Terraform. `backend/_examples/{python,nodejs,java}-service` are templates. Folders starting with `_` or `.` are never deployed.
- `frontend/`: Vite + React 19 single-page app. Right now it's only the Vite hello-world. **MUI, React Router and react-responsive are not installed yet**, even though the docs call for them.
- `data/<job>/`: PySpark batch jobs (`job.py` + `requirements.txt`), deployed as Kubernetes Jobs through `infra/helm/`, and only when EKS is enabled. `data/_examples/python-job` is a stub of bronze/silver/gold ETL steps.
- `infra/`: flat Terraform root module (no submodules of its own). It uses the AWS provider `~> 6.0`, `terraform-aws-modules/lambda ~> 8.0`, Terraform `>= 1.11` and S3 remote state.
- `bin/`: every dev and deploy entry point. See [bin/README.md](bin/README.md).

## Commands

Always run scripts from the repo root. They resolve paths themselves.

```sh
./bin/deploy-backend.sh         # deploys to AWS. Runs `terraform apply -auto-approve`
./bin/deploy-frontend.sh        # npm run build, sync to S3, invalidate CloudFront
./bin/generate-env.sh           # regenerate frontend/.env.local from Terraform outputs
./bin/cleanup-environment.sh    # terraform destroy. Irreversible
```

Frontend (from `frontend/`): `npm run dev`, `npm run build`, `npm run lint`, `npm run preview`.

Run the Python example handler directly with `python backend/<svc>/function.py`. This needs the DB env vars, or the defaults `localhost` / `test` / `test`.

Lambda logs:
```sh
aws logs tail /aws/lambda/coding-workshop-<svc>-<app_id> --follow
```

There is **no test framework configured anywhere yet** (no pytest, Jest or Vitest). Adding one is part of the expected work.

**Ask before running** anything that touches AWS or destroys state: `deploy-backend.sh`, `deploy-frontend.sh`, `cleanup-environment.sh` and `setup-participant.sh`.

## How the pieces connect

- **Service discovery** ([infra/locals.tf](infra/locals.tf)): Terraform globs one level under `backend/`. A folder with `requirements.txt` becomes Python 3.13 with handler `function.handler`. A folder with `package.json` becomes `nodejs24.x` with `index.handler`. A folder with `pom.xml` becomes `java25` with `com.example.Handler::handleRequest`, built with `mvn package` during apply. A Python service therefore needs **both** `requirements.txt` (for discovery) and `function.py` exposing `handler(event, context)`. The backend README says discovery keys off `function.py`, but Terraform actually uses `requirements.txt`.
- **Naming**: Lambda `coding-workshop-<folder>-<app_id>`. `app_id` is the participant ID (`TF_VAR_aws_app_code`), defaulting to `abcd1234`.
- **Lambda exposure**: each function gets a public Function URL (`authorization_type = NONE`, CORS `*`) plus an SQS DLQ. **The backend must enforce auth itself**, because nothing sits in front of it.
- **Routing**: CloudFront serves S3 as the default origin and adds one ordered behavior per function, `/api/<folder>*`, pointing at that Function URL. The Lambda sees `rawPath` = `/api/<folder>/...`. The pattern is a prefix match, so avoid service names that are prefixes of each other, such as `team` and `teams`.
- **Lambda events** use the Function URL payload format (v2). Read the method from `event["requestContext"]["http"]["method"]`, and read `rawPath`, `queryStringParameters` and `body` (a string, possibly base64-encoded via `isBase64Encoded`). Return `{statusCode, headers, body: json.dumps(...)}`.

## Environment variables

Terraform injects these into every Lambda ([infra/locals.tf](infra/locals.tf) `env_vars`).

| Var | Value |
|---|---|
| `IS_LOCAL` | `false` |
| `POSTGRES_HOST` | Aurora endpoint |
| `POSTGRES_NAME` / `_USER` / `_PASS` | `codingworkshop` / `superadmin` / random |
| `MONGO_*` | DocumentDB, **only if `TF_VAR_aws_mongo_enabled=true`**; otherwise unset |
| `JWT_SECRET` | `random_password.jwt_secret` (64 chars, `infra/main.tf`); signs access tokens |

Empty values are dropped entirely, so code must tolerate missing vars. Postgres needs `sslmode=require`, and Mongo needs `tls=True, tlsAllowInvalidCertificates=True, retryWrites=False`.

Keep connections in module-level globals so warm Lambda invocations reuse them, and reset them on error. [backend/_examples/python-service/postgres_service.py](backend/_examples/python-service/postgres_service.py) shows the pattern, using psycopg 3 and pymongo.

Toggle features with `TF_VAR_aws_postgres_enabled` (default true), `TF_VAR_aws_mongo_enabled` (default false) and `TF_VAR_aws_eks_enabled` (default false; this is what enables JupyterHub and the data jobs).

## Frontend env gotcha

`generate-env.sh` writes `frontend/.env.local` with both `REACT_APP_*` and `VITE_*` keys: `API_URL`, `API_ENDPOINTS` (JSON map of service to path/URL) and `LAMBDA_URLS`. **Vite only exposes the `VITE_` ones**, so read them as `import.meta.env.VITE_API_URL`, not `process.env.REACT_APP_*`. `frontend/.env.sample` still shows the `REACT_APP_` names. `VITE_API_URL` is the CloudFront URL, and API calls go to `${VITE_API_URL}/api/<service>`.

Also, [frontend/eslint.config.js](frontend/eslint.config.js) imports `eslint-plugin-react-hooks` and `eslint-plugin-react-refresh`, but neither is listed in `package.json`. Install them before `npm run lint` will work.

## Conventions

These come from `.github/instructions/`:

- **Python** (`backend/**/*.py`): PEP 8, snake_case, CamelCase classes, type hints on parameters and returns, and docstrings on all public modules, classes and functions.
- **React** (`frontend/**`): Airbnb style, camelCase, PascalCase components, PropTypes on every component, and JSDoc on public functions and components.
- **Terraform** (`infra/*.tf`): snake_case, a comment on every resource and variable, and `terraform validate` before committing.

The examples also use a `logging` logger in handlers and a catch-all that returns a JSON 500. Build on that with the specific status codes listed in the full-stack guide (201, 204, 400, 404).

## CI

Defined in `.github/workflows/` and run on every push and PR. These are security scans only; there are no tests or builds.

- `bandit -r ./backend` (Python 3.11)
- `npm audit --audit-level=high` in `frontend/` (Node 24). A high-severity advisory in a newly added dependency fails CI.
- Checkov on `infra/`. This is a soft fail, so it never blocks.

## Local-only files (gitignored, never commit)

`ENVIRONMENT.config` (temporary AWS credentials written by `setup-participant.sh`), `*.config`, `.env*` except `.env.sample`, `*.tfvars`, Terraform state, and `package-lock.json` (which is ignored on purpose).
