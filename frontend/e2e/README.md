# End-to-end checks

Thirteen Playwright flows run against the real app and API with the seeded accounts from
`LOGIN.md`: the route guard, the task workflow (employee submits, manager reviews), the admin's
project and account flows, the manager's team flow, the manager taking on and releasing the
unassigned employee `emp005`, the employee's My teams page, the employee logging hours from the
Overview, correcting the entry on My hours and removing it, the admin reviewing an archive
event in Audit activity and restoring the project from Archives, the manager reading
Reports and opening a project from Hours by project, and the employee changing their own name on
Settings and seeing the sidebar update.

```sh
# 1. start the dev stack (API on :8000, proxy on :3001, Vite on :3000)
./bin/start-dev.sh            # or: uvicorn + bin/proxy-server.js + npm run dev
# 2. run
cd frontend && npm run test:e2e
```

Full guide, including starting the stack and fixing common errors: [../TESTING.md](../TESTING.md).

The flows are repeatable on the same database: the task flow starts the task only if it is
still assigned and ends by reopening it, the admin flows archive the project and the account
they create (named "E2E check …" and "E2E Person …", visible under Archives), the team flow
leaves a detached "E2E team …" behind (teams cannot be deleted), the hours flow removes the
entry it logged, the settings flow puts the name back, and the audit flow restores the newest archived "E2E check …" project (creating
and archiving one first if none is there). Reseed with
`python -m app.db.bootstrap` on a fresh database to start from scratch.
