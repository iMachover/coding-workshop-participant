# End-to-end checks

Four Playwright flows, one per role plus the route guard, run against the real app and API
with the seeded accounts from `LOGIN.md`.

```sh
# 1. start the dev stack (API on :8000, proxy on :3001, Vite on :3000)
./bin/start-dev.sh            # or: uvicorn + bin/proxy-server.js + npm run dev
# 2. run
cd frontend && npm run test:e2e
```

The flows are repeatable on the same database: the task flow starts the task only if it is
still assigned and ends by reopening it, and the admin flow archives the project it creates
(named "E2E check …", visible under Archives). Reseed with `python -m app.db.bootstrap` on a
fresh database to start from scratch.
