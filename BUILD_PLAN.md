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
| `SearchBox` + filter select | `components/SearchBar.jsx` (new) |
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
- [x] New SidePanel, ToastProvider/useToast, SearchBar, PersonCell and EmptyState
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
- [x] Deferred: Employee Overview "project memberships" / "what comes next" blocks → the My teams page (slice 4)
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
- [x] Attach teams so new projects can get tasks: done in slice 4
- [x] "Log hours" button: done in slice 5
- [x] Owner reviewed and committed 2026-10-14 (1976269)

### Slice 4: People, My team, My teams
- [x] Admin API: `GET /users` (paginated, search, role / department / archived filters, role counts),
      `POST /users` (generated 6-character username, temporary password), `GET /users/{id}` (profile with
      projects, teams, milestone progress, recent hours, blockers), `PATCH /users/{id}` (role change 409
      while a manager has active projects or reports, or an employee has open tasks), archive / restore
      (409 for own account or the last admin; login revoked at once), `GET /users/options`
- [x] Manager API: `GET /employees`, `GET/PATCH /employees/{id}` (name and email only), `GET/POST /teams`,
      `PATCH /teams/{id}`, `POST/DELETE /teams/{id}/members/{user_id}` (direct reports; an unassigned
      employee becomes one), `POST /employees/{id}/assign` and `/release` (owner decision 2026-10-14:
      managers pick from the full employee list, one manager per employee, another manager's people
      are blocked until an admin moves them, and managers release their own),
      `POST/DELETE /projects/{id}/teams/{team_id}` (own project and own team), `GET /teams/options`
- [x] Employee API: `GET /me/teams` (manager card, each project's current milestone, own progress,
      teammates' progress and never their cost)
- [x] Every write records an audit row (`user`, `team`, `project` entities)
- [x] pytest: 28 tests → 153 total; Postman "People and teams" folder (46 requests, 108 total)
- [x] Pages: People & access (admin) with pagination, filters, create-user panel and one-time credentials
      dialog; My team (manager) with direct reports table, hours per team, Teams card, create / assign /
      manage panels (PeoplePicker: job title filter, name search, first 25 from `GET /employees/search`,
      own and unassigned employees only, team members hidden; the profile panel releases a direct report) (removing a member or detaching a project asks for confirmation, owner request
      2026-10-14); My teams (employee): one row per team with search, state and project-health filters, and a
      team panel (`?team=<id>`) for the manager, milestone detail and teammates (owner request 2026-10-14). Person profile panel mounted in the shell (`?person=<id>`),
      so the manager Overview's people rows open it. Admin Overview gained Create user / Create project.
- [x] Browser check (Playwright, 1440px and 390px, all three roles, no console errors); e2e suite
      gained 3 flows (admin creates and archives an account, manager creates a team on a project and
      detaches it, employee sees My teams) → 8 flows
- [x] Docs: READMEs, TESTING.md, LOGIN.md, this file
- [ ] Deferred: Employee Overview "project memberships" / "what comes next" blocks (My teams covers
      them for now); department management (ADMIN.md §6.6, slice 8)
- [x] Owner reviewed and committed 2026-10-14

### Slice 5: My hours (employee)
- [x] API (`app/hours/`): `GET /me/time-entries?from&to` (default this week; week totals, available hours,
      loggable tasks), `POST /tasks/{id}/time-entries` (own task in progress or submitted; 0 < hours ≤ 24
      and ≤ 24 h per day; no future dates; 409 on assigned / completed tasks or closed projects),
      `PATCH` / `DELETE /time-entries/{id}` (own, task not completed), `GET /tasks/{id}/time-entries`
      (employee own, manager all on own projects, admin all). Audit: `logged_hours`, `updated`, `deleted`.
- [x] Page `/hours`: stat cards, one-week ledger with previous / next / this week, search, View / correct
      panel (save correction, remove with confirmation), Export CSV of the week shown
- [x] Log hours panel mounted in the shell (`?log=<task>` or `?log=0`): opened from the Overview's
      [Log hours] (deferred from slice 3), My hours, and "Log hours on this task" in the task panel, which
      now lists the logged hours (own for employees, everyone's for the manager)
- [x] Browser check (1440px and 390px, no console errors)
- [x] pytest: 28 tests (`test_hours.py`); Postman "Hours" folder (26 requests); Playwright flow (log, correct, remove)
- [x] Docs: READMEs, TESTING.md, this file
- [x] Owner reviewed and committed 2026-10-14

### Slice 6: Audit and Archives (admin)
- [x] API (`app/audit/`, read-only): `GET /audit` (search actor / code / summary; action, entity, actor and
      date filters; pagination; filter values in the envelope), `GET /audit/{id}` (details plus a per-field
      before / after diff), `GET /archives` (projects and users together, archived date and actor from the
      audit log, type filter, search, pagination). Restore reuses the project and user restore routes.
- [x] Pages: Audit activity (`/audit`) with the event details panel; Archives (`/archives`) with Restore
      record behind a confirmation panel; rows open the project or person panel
- [x] Browser check (1440px and 390px, no console errors)
- [x] pytest: 14 tests (`test_audit.py`); Postman "Audit and archives" folder (29 requests); Playwright flow (filter, view change, restore)
- [x] Docs: READMEs, TESTING.md, this file
- [x] Owner reviewed and committed 2026-10-14

### Slice 7: Reports (manager)
- [x] `GET /manager/reports` (`app/reports/`): totals, hours and cost per project, weekly labour cost for the
      last 5 weeks, over-allocated direct reports, planning note (at risk first, then budget use furthest
      ahead of delivery, among projects with tasks)
- [x] Page `/reports`: stat cards, Hours by project (rows open the project panel), Weekly resource cost bar
      chart, Planning note card with Review projects; Export CSV of the project rows and the weekly series
- [x] Browser check (1440px and 390px, no console errors)
- [x] pytest: 11 tests (`test_reports.py`, figures cross-checked against /projects and /manager/overview); Postman "Reports" folder (5 requests); Playwright flow
- [x] Docs: READMEs, TESTING.md, this file
- [x] Owner reviewed and committed 2026-10-14

### Slice 8: Settings (all roles)
- [x] `PATCH /me` (name and email only; email unique; audit row when changed); the signed-in user in the
      shell updates at once
- [x] Departments (`app/departments/`): `GET /departments` (all roles), `POST` and `PATCH` (admin; unique
      name, three-letter upper-case prefix; existing project codes keep theirs; audit rows)
- [x] Page `/settings`: Account card (name, email, role badge, Save), Notifications card labelled as not
      saved, "Your access" side card per role, Departments card for admins (list, create, rename)
- [x] Browser check (admin at 1440px, employee at 390px, no console errors)
- [x] pytest: 44 tests (`test_settings.py`); Postman "Settings" folder (19 requests); Playwright flow (rename and back)
- [x] Docs: READMEs, TESTING.md, this file
- [x] Owner reviewed and committed 2026-10-14

## Blockers and decisions

- **2026-10-14: Tests per slice run in a background agent** while the next slice is built (owner
  request). Each agent writes the pytest file, Postman folder and Playwright flow for its slice and
  reports app bugs back instead of fixing app code. Totals after slice 8: 250 pytest, 187 Postman
  requests, 13 Playwright flows.
- **2026-10-14: Slices 5 to 8 committed together.** Their routes and pages share the same wiring files
  (`app/main.py`, `App.jsx`), so one commit keeps every intermediate state importable.

- **2026-10-13: Material UI over the prototype's CSS.** The workshop requires MUI, so it wins
  over the Replit handoff note.
- **2026-10-13: Testing for the MVP** is pytest, Postman with JWT and a small Playwright suite.
  Vitest, load testing and CI are skipped.
- **2026-10-13: Plain page titles.** The prototype's headline copy (for example "A clear view of
  the whole portfolio.") is replaced with plain titles, as already decided for the Overview pages.
- **2026-10-13: Vitest removed.** The earlier agent had added Vitest, Testing Library, coverage
  and a few `*.test.js` files; the owner chose to drop them for the MVP.
