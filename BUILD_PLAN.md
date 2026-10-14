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
- [ ] Owner reviews and commits

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
- [ ] Owner reviews

### Slice 2: Projects (`/projects`, all roles)
- [ ] API: `GET /projects` (scoped to the role), `GET /projects/{id}`
- [ ] Employee Overview gains the prototype's "Your project memberships" table and
      "What comes next" milestone sequence once `GET /me/projects` exists (needs API data;
      not in `GET /me/overview` today)
- [ ] API: `POST /projects` (admin), `PATCH /projects/{id}` (admin, or a manager changing only
      dates and budget), `POST /projects/{id}/archive` (admin)
- [ ] Shared audit helper used by every write
- [ ] pytest (including role checks), Postman
- [ ] Page and project side panel
- [ ] Docs

### Slice 3: tasks and milestones
- [ ] Employee: `PATCH /tasks/{id}/status`, forward only; 409 if another milestone is already active
- [ ] Manager: approve or reopen tasks; create milestones in sequence; approve or reopen milestones
- [ ] `POST /milestones/{id}/notes`
- [ ] pytest, Postman
- [ ] Side panel actions and Overview action buttons
- [ ] Playwright set up, with the first e2e tests
- [ ] Docs

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
