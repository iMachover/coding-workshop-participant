# Build plan: frontend from the Replit prototype

The tracker for finishing the app. Tick a box when the work is done. Nothing is committed by
Claude; each slice stops at "ready for review" and the owner reviews and commits.
Add anything that blocks progress, or any decision made along the way, to
[Blockers and decisions](#blockers-and-decisions).

## Source of truth

- **Design and behaviour:** the Replit prototype in
  [assets/acme-react-handoff/](assets/acme-react-handoff/), kept unchanged as the reference.
  Screenshots are in `assets/{admin,manager,employee}/`.
- **Role rules:** [ADMIN.md](ADMIN.md), [MANAGER.md](MANAGER.md), [EMPLOYEE.md](EMPLOYEE.md)
  (§6 pages, §7 API).
- **Stack:** [WORKSHOP_GUIDELINES.md](WORKSHOP_GUIDELINES.md) requires Material UI. The prototype's
  layout, wording and behaviour are rebuilt with MUI components, and `theme.js` uses the
  prototype's colours and fonts. Its plain CSS and `lucide-react` icons are not copied.
- **Data:** the prototype's sample data (`projectsSeed`, `peopleSeed`, `auditSeed`, hard-coded
  names and dates) is never copied. Everything comes from the API and the signed-in user.

## How the prototype maps to our code

| Prototype (`_shared/Shell.tsx`, `_RoleWorkspace.tsx`) | Ours |
|---|---|
| `Shell` / `RoleShell` | `layout/AppShell.jsx`, `Sidebar.jsx`, `TopBar.jsx` (nav from `config/navigation.js`) |
| `Heading` | `layout/PageHeader.jsx` |
| `Stat` | `components/StatCards.jsx` |
| `Badge` | `components/StatusChip.jsx` + `config/statuses.js` |
| `Progress` | `components/Meter.jsx` |
| `.acme-focus` banner | `components/HighlightBanner.jsx` |
| `.acme-panel` | `components/SectionCard.jsx` |
| `.acme-role-metric` | `components/FigureRow.jsx` |
| `money()` | `utils/format.js` |
| `Drawer` | `components/SidePanel.jsx` (new; MUI `Drawer` on the right) |
| `Toast` | `context/ToastProvider.jsx` + `useToast` (new; MUI `Snackbar`) |
| `SearchBox` + filter select | `components/TableToolbar.jsx` (new) |
| `Person` | `components/PersonCell.jsx` (new) |
| `Empty` | `components/EmptyState.jsx` (new) |

## Testing for the MVP

- **pytest**: each new endpoint gets the happy path, 401 with no token, 403 for each wrong role,
  out-of-scope records (for example another manager's project), 422 on bad input, the business
  rules, and a check that an audit row was written.
- **Postman**: add each endpoint to
  `backend/api/postman/project-tracker-api.postman_collection.json`, logging in per role with the JWT saved.
- **Playwright e2e**: 4–6 tests in `frontend/e2e/`, added after slice 2. Each role does its main
  action, and one test checks that a blocked URL shows the Forbidden page.
- **Lint and build**: `npm run lint && npm run build`.
- Skipped for the MVP: load testing, CI.

## Slices

Each slice: backend endpoints, tests, page, Postman, docs, then ready for review.

### Slice 0: done before the Replit handoff (built from the screenshots)
- [x] JWT login, roles, `ProtectedRoute`, role-based routes and sidebar
- [x] Database: all 13 tables, seed data ([LOGIN.md](LOGIN.md))
- [x] API: `GET /me/overview`, `GET /manager/overview`, `GET /admin/overview` (read-only, with role checks)
- [x] Overview page for each role, loading real data
- [x] Shared components: StatCards, StatusChip, Meter, HighlightBanner, SectionCard, FigureRow, LoadState
- [x] Checked 2026-10-13: 84 pytest tests pass, lint is clean, the build succeeds
- [x] Owner reviewed and committed 2026-10-14 (1fd1b5d)

### Slice 1: shell and theme to match the prototype
- [x] `theme.js` uses the prototype's colours and fonts (DM Sans and Manrope, loaded in `index.html`)
- [x] Sidebar, top bar and new footer restyled to match `Shell`
- [x] New SidePanel, ToastProvider/useToast, TableToolbar, PersonCell and EmptyState
- [x] The three Overview pages restyled to match the prototype dashboards (Admin portfolio gained
      the prototype's search and health filter, client-side)
- [x] Protected routes re-checked in a browser (Playwright, 2026-10-13): signed-out users go to
      `/login`, emp001 opening `/audit` sees the Forbidden page, and the sidebar lists only that
      role's pages
- [x] Lint clean, build passes, all three roles' overview endpoints return 200
- [x] Browser check at 1440px and 390px for all three roles: renders with real data, no console
      errors or failed requests (Playwright + Chromium installed as a dev dependency for slice 3)
- [x] Docs: README layout, test commands and design references updated
- [x] Owner reviewed and committed 2026-10-14 (1fd1b5d)

### Slice 2: Projects (`/projects`, all roles)
- [x] API: `GET /projects` (admin all, manager own, employee joined, `?q=` search, `?archived=` admin),
      `GET /projects/{id}` with milestones and teams, `GET /me/projects` alias, `GET /projects/options`
- [x] API: `POST /projects` (admin, code generated from the department counter), `PATCH /projects/{id}`
      (admin any field incl. manager; manager only name, description, dates, budget of own projects),
      `POST /projects/{id}/archive` and `/restore` (admin, 409 if already in that state)
- [x] Shared audit helper `app/core/audit.py` (`record`, `changes`); every write records a row, an
      unchanged PATCH records nothing
- [x] Totals come from the Overview query (`project_rows`, now with scope filters) so pages agree
- [x] pytest: 25 tests (scoping per role, 401/403/404, validation 400s with `fields`, audit rows,
      archive/restore) → 109 total; Postman "Projects" folder (24 requests, per-role JWT logins)
- [x] Page: register banner, searchable table with health filter, project side panel (figures,
      milestone chain, edit, archive with confirm), create form; `?selected=<id>` deep link
- [x] Overview pages link to the panel: admin portfolio rows, manager "Open project", employee task rows
- [x] Projects without a team are flagged (owner request 2026-10-14): every project row carries
      `team_names`; the table, the panel (with a "assign one from My team" note for the manager),
      the register banner ("Without a team" count) and the manager's Overview banner show an amber
      "No team assigned" badge until a team is linked (slice 4)
- [x] `useApiGet` accepts a null path; `SidePanel` mounts in its own container so an open panel does
      not aria-hide toasts
- [x] Browser check (Playwright): admin create → toast → panel → archive; manager edit without a
      manager field; employee read-only panel with own cost; phone width; no console errors
- [x] Docs: README status, endpoints and layout; backend README "Project endpoints"
- [ ] Deferred to slice 3: milestone notes and task approval inside the panel; `POST /projects/{id}/close`
- [ ] Deferred: Employee Overview "project memberships" / "what comes next" blocks (need `GET /me/teams`)
- [x] Owner reviewed and committed 2026-10-14 (bf4af04)

### Slice 3: tasks and milestones
- [x] Employee: `PATCH /tasks/{id}` forward only; 409 when the milestone is locked (Blocked), when
      another milestone holds their in-progress work (one active milestone, across projects), or
      when the status would go backwards
- [x] Manager: complete / reopen tasks, `POST /projects/{id}/milestones` (sequence = last + 1),
      `POST /milestones/{id}/tasks` (assignee must be on a team attached to the project),
      `POST /milestones/{id}/approve` (every task completed, unlocks the next), `POST /projects/{id}/close`
- [x] `GET /tasks/{id}`, `GET /milestones/{id}` scoped per role; `POST /milestones/{id}/notes`
- [x] pytest: 16 tests incl. the full loop (finish tasks → approve both milestones → close) → 125 total;
      Postman "Tasks and milestones" folder (21 requests)
- [x] Panels mounted once in the shell and driven by the URL (`?selected=&milestone=&task=`), so any
      page links into them and the browser back button closes them; `RefreshProvider` reloads lists
      after a panel action
- [x] Task panel: Start / Submit (employee), Approve / Request changes / Reopen (manager);
      milestone panel: tasks, add task form, approve, note conversation; project panel: add milestone,
      close project; Overview buttons wired (employee task rows, manager review queue, milestone cards,
      "Assign employee")
- [x] Playwright e2e suite in `frontend/e2e/` (`npm run test:e2e`): sign-in and forbidden route,
      employee submits a task, manager approves and reopens it, admin creates and archives a project
- [x] Docs: READMEs, TESTING.md, this file
- [ ] Deferred to slice 4: attach teams so new projects can get tasks; "Log hours" button (slice 5)
- [x] Owner reviewed and committed 2026-10-14

### Slice 4: People, My team, My teams
- [ ] Admin: `GET/POST/PATCH /users`, archive a user
- [ ] Manager: team list with 40-hour capacity, create teams, membership and hours, edit a
      report's name and email
- [ ] Employee: `GET /me/teams`
- [ ] pytest, Postman, pages, Playwright, docs

### Slice 5: My hours (employee)
- [ ] `GET/POST/PATCH /me/time-entries` (no more than 24 h per entry, own tasks only), CSV export
- [ ] pytest, Postman, page, docs

### Slice 6: Audit and Archives (admin)
- [ ] `GET /audit`, `GET /archives`, restore projects and users
- [ ] pytest, Postman, pages, Playwright, docs

### Slice 7: Reports (manager)
- [ ] `GET /manager/reports`, CSV export
- [ ] pytest, Postman, page, docs

### Slice 8: Settings (all roles)
- [ ] `PATCH /me` (name and email only)
- [ ] Notification checkboxes, labelled as not saved yet
- [ ] pytest, Postman, page, docs

## Blockers and decisions

- **2026-10-13: Material UI over the prototype's CSS.** The workshop requires MUI, so it wins
  over the Replit handoff note.
- **2026-10-13: Testing for the MVP** is pytest, Postman with JWT and a small Playwright suite.
  Vitest, load testing and CI are skipped.
- **2026-10-13: Plain page titles.** The prototype's headline copy (for example "A clear view of
  the whole portfolio.") is replaced with plain titles, as already decided for the Overview pages.
- **2026-10-13: Vitest removed.** The earlier agent had added Vitest, Testing Library, coverage
  and a few `*.test.js` files; the owner chose to drop them for the MVP.
