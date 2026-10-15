# Frontend testing: lint, build and Playwright

Run from `frontend` unless a step says otherwise.

The frontend has no unit tests. It is checked three ways:

1. **Lint** catches code mistakes. No server needed.
2. **Build** proves the app compiles for production. No server needed.
3. **Playwright** clicks through the real app in a browser, against the real API and database.

For the backend tests (pytest and Postman), see [backend/api/TESTING.md](../backend/api/TESTING.md).

## 1. Lint

```sh
npm install        # once
npm run lint
```

**Expected result:** no output after the `eslint .` line. Any problem is printed with its file and line.

## 2. Build

```sh
npm run build
```

**Expected result:** ends with `✓ built in …`. A warning that a chunk is larger than 500 kB is normal and can be ignored.

## 3. Playwright

Playwright opens Chromium, signs in with the seeded accounts and works through 13 flows the way a
person would. It needs three things running first: the API, the proxy and the Vite dev server.

**Setup, once**

```sh
npm install
npx playwright install chromium     # downloads the browser Playwright drives
```

Then make sure `frontend/.env.local` exists and points the proxy at the local API:

```sh
VITE_API_URL=http://localhost:3001
VITE_API_ENDPOINTS='{"api":"http://localhost:8000"}'
```

**Start the stack**

Use three terminal windows. Leave each one running.

```sh
# Terminal 1: the API on :8000
cd backend/api            # from the repo root

# Workshop VM
export JWT_SECRET=dev POSTGRES_USER=postgres POSTGRES_PASS=postgres123
# Mac with Homebrew Postgres
export JWT_SECRET=dev

.venv/bin/python -m app.db.bootstrap
.venv/bin/uvicorn app.main:app --reload --port 8000
```

```sh
# Terminal 2: the proxy on :3001, from the repo root
node bin/proxy-server.js
```

```sh
# Terminal 3: the app on :3000
cd frontend               # from the repo root
npm run dev
```

The API setup (virtual environment, database) is the same as for Postman in
[backend/api/TESTING.md](../backend/api/TESTING.md). `./bin/start-dev.sh` starts everything
in one go, but it also brings up LocalStack and Terraform, which is slower.

Open http://localhost:3000 and sign in as `emp003` / `Employee123!` to check the stack works
before running the tests.

**Run**

In a fourth terminal, from `frontend`:

```sh
npm run test:e2e
```

**Expected result**

```text
13 passed (about 1m)
```

The tests run one at a time, in order, because some depend on earlier ones (the employee submits a
task, then the manager reviews it).

**Other ways to run**

```sh
npx playwright test e2e/hours.spec.js        # one file
npx playwright test -g "Reports"             # tests whose name matches
npx playwright test --headed                 # show the browser while it runs
npx playwright test --ui                     # pick tests and step through them
```

To test another address, such as the deployed app, set `E2E_BASE_URL`:

```sh
E2E_BASE_URL=https://example.cloudfront.net npm run test:e2e
```

**When a test fails**

The output names the test and the line that failed. Playwright saves a screenshot and a trace in
`test-results/<test name>/`. To replay the trace step by step:

```sh
npx playwright show-trace test-results/<test name>/trace.zip
```

`error-context.md` in the same folder shows what was on the page when the test failed.

**What the tests cover**

| File | Count | What it checks |
| ---- | ----- | -------------- |
| `e2e/access.spec.js` | 2 | Signed-out visitors are sent to the login page. An employee sees only employee pages and gets "no access" on an admin URL. |
| `e2e/admin-projects.spec.js` | 1 | The admin creates a project and archives it. |
| `e2e/audit-archives.spec.js` | 1 | The admin finds an archive event in Audit activity, then restores the project from Archives. |
| `e2e/hours.spec.js` | 1 | The employee logs hours from the Overview, corrects the entry on My hours, then removes it. |
| `e2e/people-teams.spec.js` | 4 | The admin creates an account, sees the credentials once, then archives it. The manager creates a team on a project and detaches it. The manager takes on the unassigned employee `emp005` and releases them. The employee sees their team, its current milestone and their manager on My teams. |
| `e2e/reports.spec.js` | 1 | The manager reads Reports and opens a project from Hours by project. |
| `e2e/settings.spec.js` | 1 | The employee changes their name on Settings, sees the sidebar update, then changes it back. |
| `e2e/task-workflow.spec.js` | 2 | The employee starts and submits a task from the Overview. The manager approves it, then reopens it. |

Shared sign-in code and the test accounts are in `e2e/helpers.js`.

**Data the tests leave behind**

You can run the tests again on the same database. Most flows undo their own changes, but a few
records stay:

- Archived projects named "E2E check …" and archived accounts named "E2E Person …". You can see them under Archives.
- Detached teams named "E2E team …". Teams cannot be deleted.

To start from clean sample data, reset the local database as described in
[backend/api/TESTING.md](../backend/api/TESTING.md#2-postman) (Reset the local database).

**Common errors**

- Every test fails at sign-in, waiting for the "Overview" heading, and the screenshot shows
  `Request failed with status 502`: the API on :8000 is not running. The proxy is up but has
  nothing to forward to. Start the API again (terminal 1).
- `net::ERR_CONNECTION_REFUSED at http://localhost:3000`: the Vite dev server is not running. Start it (terminal 3).
- `Executable doesn't exist at …/chromium…`: the browser is missing. Run `npx playwright install chromium`.
- The proxy exits with `Could not load endpoints from .env.local`: create `frontend/.env.local` as shown in Setup.
- A test that passed before now fails after a failed run: an earlier run stopped part way and left
  data in an unexpected state, for example a task already submitted. Reset the local database and run again.

**Test logins**

| Username | Password     | Role     |
| -------- | ------------ | -------- |
| emp003   | Employee123! | Employee |
| mgr001   | Manager123!  | Manager  |
| adm001   | Admin123!    | Admin    |
