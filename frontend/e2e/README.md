# End-to-end checks

Eight Playwright flows run against the real app and API with the seeded accounts from
`LOGIN.md`: the route guard, the task workflow (employee submits, manager reviews), the admin's
project and account flows, the manager's team flow, the manager taking on and releasing the
unassigned employee `emp005`, and the employee's My teams page.

```sh
# 1. start the dev stack (API on :8000, proxy on :3001, Vite on :3000)
./bin/start-dev.sh            # or: uvicorn + bin/proxy-server.js + npm run dev
# 2. run
cd frontend && npm run test:e2e
```

The flows are repeatable on the same database: the task flow starts the task only if it is
still assigned and ends by reopening it, the admin flows archive the project and the account
they create (named "E2E check …" and "E2E Person …", visible under Archives), and the team flow
leaves a detached "E2E team …" behind (teams cannot be deleted). Reseed with
`python -m app.db.bootstrap` on a fresh database to start from scratch.
