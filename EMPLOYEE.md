# Employee MVP

Source of truth: WORKSHOP_GUIDELINES.md (requirements), WORKSHOP_NOTES.md (rules per role),
assets/employee/*.png (layout and content). Scope: the minimum an employee needs.
Everything an employee can do is on this page; nothing else.

## 1. User flows (build order)

1. **Log in** with username + password. No self-registration. Accounts are created by an admin.
2. **View my work**: Overview (today's focus), My projects, My teams. Projects I am on (each with
   its owning department) → their milestones → my tasks, with my hours and my cost.
3. **Update task status**: assigned → in progress → submitted. Forward-only. "Completed" and
   "reopen" are manager-only.
4. **Log hours**: record hours worked per day against one of my tasks, after the work. No timer.
   Correct or delete my own entry while the task is not completed.
5. **Milestone notes**: read the note thread on a milestone and add a note (conversation with manager).
6. **Edit my profile**: first name, last name, email. Nothing else.

Slices 1–4 ship first. 5 and 6 last.

## 2. Domain rules

- Each project belongs to exactly one owning department. Multiple teams, from any department,
  can contribute to a project. Department is a read-only label for the employee.
- Hierarchy: project → milestones → tasks. Status lives on the task. Milestone progress is
  derived from its tasks; project progress from its milestones.
- Milestones are sequenced within a project. Milestone N is locked until N-1 is completed.
- **One active milestone per employee, across all projects.** My active milestone is the one
  holding my in_progress task(s). Starting a task in any other milestone is rejected (409) until
  all my in_progress tasks are submitted. Membership in a second team does not create a second
  active milestone.
- Task status (stored): assigned, in_progress, submitted, completed. Forward-only for employees.
  `started_at` / `submitted_at` / `completed_at` are status timestamps only.
  Display states (derived, not stored): **Blocked** = task's milestone is locked;
  **Queued** = milestone unlocked but not my active milestone; **Completion requested** = submitted.
- **Hours are logged, not timed.** A time entry = task + date + hours (+ optional note).
  Only on my own tasks that are in_progress or submitted. 0 < hours ≤ 24 per entry.
  Actual hours (task / milestone / project / week) = sum of entries. Nothing auto-accrues.
- Pay rate: one `hourly_rate` per user, seeded by job title for MVP. Cost = logged hours × rate.
  Manager/admin editing the rate is a stretch goal.
- Weekly capacity is a constant 40 h (Mon–Fri). "This week" = Monday–Sunday containing today.
- Resources are physical items a task needs (carts, printer parts, lightbulbs): name, quantity,
  estimated cost, actual cost. Manager creates them; employee views.
- Visibility: the employee sees ONLY their own hours and cost. On My teams they also see
  teammates' progress % (never teammates' cost). Project budget is never shown.
- Project health (derived): **At risk** if the project's active milestone is past its projected
  end date or the project's logged hours exceed its predicted hours; otherwise **Pending** while
  no team is assigned, and **On track** once one is.
- Every employee write (status change, time entry, note, profile edit) is written to the audit log.

## 3. Core actions

| Flow | Action | Writes |
|------|--------|--------|
| Login | Submit username+password → JWT | — |
| Login | Log out (client drops token) | — |
| View | Overview: stat cards, active milestone banner, assigned work table, resource snapshot | — |
| View | My projects: table with dept, health, progress, my hours a/p, my cost, target end | — |
| View | My teams: per team → project, manager, current milestone, my progress, teammates' progress | — |
| View | Open one task: description, resources, due date, my time entries | — |
| Task status | Start task (assigned → in_progress); 409 if another milestone is my active one | tasks.status, started_at, audit_log |
| Task status | Submit task (in_progress → submitted) | tasks.status, submitted_at, audit_log |
| Hours | Log hours on a task for a date | time_entries, audit_log |
| Hours | Edit / delete my entry (task not completed) | time_entries, audit_log |
| Hours | My hours: week ledger, logged vs 40 h, my cost this week | — |
| Notes | Read milestone note thread; add note | milestone_notes, audit_log |
| Profile | View; update first_name / last_name / email | users, audit_log |

## 4. Data requirements

Stored (read by employee): own user row; projects I belong to via team membership, each with its
owning department and manager; milestones; my tasks; task resources; my time entries;
milestone notes; audit log entries I generate.

Computed, never stored: actual hours and cost at task / milestone / project / week level;
progress % (task counts by status); milestone lock state; my active milestone; Blocked / Queued
display states; project health; hours and cost "this week".

## 5. Database tables

Shared tables, listed in full so later roles extend rather than redesign. Employee slice WRITES
only to `tasks` (status, started_at, submitted_at), `time_entries`, `milestone_notes`,
`users` (own name/email) and `audit_log`. Everything else is read-only here and seeded.

- **departments**: department_id PK, department_name unique
- **users**: id, username char(6) unique, password_hash, first_name, last_name, email unique,
  job_title, role enum(admin|manager|employee), hourly_rate numeric, manager_id FK users null,
  is_archived bool, created_at, updated_at
- **projects**: id, code varchar unique (e.g. INF-024), name, description,
  department_id FK departments not null, manager_id FK users, start_date, end_date,
  budget numeric, status enum(active|closed), is_archived bool, created_at, updated_at
- **teams**: id, name, manager_id FK users (owner), created_at
- **team_members**: team_id FK, user_id FK — composite PK
- **project_teams**: project_id FK, team_id FK — composite PK
- **milestones**: id, project_id FK, name, description, sequence int, start_date,
  projected_end_date, predicted_hours numeric, status enum(not_started|in_progress|completed),
  completed_at, created_at, updated_at — unique(project_id, sequence)
- **tasks**: id, code varchar unique (e.g. TSK-142), milestone_id FK, assigned_to FK users,
  title, description, predicted_hours numeric, due_date, status
  enum(assigned|in_progress|submitted|completed), started_at, submitted_at, completed_at,
  created_at, updated_at
- **task_resources**: id, task_id FK, name, quantity int, estimated_cost numeric,
  actual_cost numeric null
- **time_entries**: id, task_id FK, user_id FK, work_date date, hours numeric(5,2) check > 0,
  note, created_at, updated_at
- **milestone_notes**: id, milestone_id FK, user_id FK, note_text, created_at
- **audit_log**: id, actor_user_id FK, action, entity_type, entity_id, entity_code, summary,
  details jsonb {before, after}, created_at (final shape; see ADMIN.md §5)

Indexes (query-driven): tasks(assigned_to), tasks(milestone_id), milestones(project_id),
team_members(user_id), project_teams(team_id), projects(department_id), projects(manager_id),
users(manager_id), teams(manager_id), time_entries(user_id, work_date), time_entries(task_id),
milestone_notes(milestone_id), audit_log(actor_user_id).

"Which projects am I on" = users → team_members → project_teams → projects → departments.

## 6. Frontend pages (per assets/employee)

App shell: left sidebar (logo, workspace label, nav, user chip), top bar with breadcrumb and date,
page header (eyebrow, title, subtitle, primary action). Material UI. Tables scroll internally.
Loading, empty and error states per card; toasts on save success/failure.

1. **Login**: username, password, submit, inline error.
2. **Overview** (`/`): primary action [Log hours]. Stat cards: assigned projects (n + dept list),
   hours this week (logged / 40), cost this week, task completion (completed / total).
   Active-milestone banner: milestone name, project, team, manager, status, due date, next task
   due, team milestone progress bar, my actual/planned hours and cost, next milestone + lock.
   "Your assigned work" table: code + milestone, title, project, status chip, actual/plan hours
   and cost, due, open. Footer note: "Submitted is not completed. Your manager approves."
   Resource snapshot card: this week's logged hours bar, lifetime logged hours and cost.
3. **My projects** (`/projects`): table: code, name, manager, dept, health chip, progress,
   my hours a/p, my cost, target end, Open. Search + status filter.
   Open → project drawer: milestones with lock state, my tasks per milestone, manager notes link.
4. **My teams** (`/teams`): one row per team: team name and manager, state (active / queued /
   no work in progress), projects with their current milestone, my progress, head count.
   Search + state and project-health filters. View team → side panel: manager, each project's
   milestone with team and my progress, teammates with progress %, Open project. Side card:
   my manager (name, email). Secondary teams show "next milestone will not activate until
   current is complete."
5. **My hours** (`/hours`): primary action [Log hours]. Stat cards: logged this week, 40 h
   capacity, my cost this week. Ledger table: date, task (+ project code), hours, cost,
   View / correct. Week navigation. Log-hours drawer: task (my in_progress/submitted tasks),
   date (default today), hours, note.
6. **Settings** (`/settings`): full name (first + last), email, role badge read-only, save.

Out of MVP (visible in mockups, deliberately omitted): notification preferences,
planning-week selector, Export CSV, forecast / variance, deliverable unit counts.

UI process: clickable HTML mockup with fake data matching these screens → review → lock → React.

## 7. API

One Lambda service `backend/api/`, FastAPI + Mangum, folders per domain under `app/`
(existing: auth, users, core, db; to add: projects, milestones, tasks, time_entries, notes),
each routes → service → repository. All endpoints except login require
`Authorization: Bearer <JWT>`. Server scopes every query to the token's user.
Errors: `{ "success": false, "error": { "code", "message", "fields"? } }`.

| Method | Path | Notes |
|--------|------|-------|
| POST | /auth/login | {username, password} → {token, user} |
| GET | /me | profile incl. manager {id, name, email} |
| PATCH | /me | {first_name?, last_name?, email?} |
| GET | /me/overview | stat cards + active milestone + assigned work (one call for the Overview page) |
| GET | /me/projects | my projects + dept + manager + health + progress + my hours/cost |
| GET | /me/teams | my teams + project + current milestone + teammates' progress % |
| GET | /projects/{id}/milestones | 403 unless I am on the project |
| GET | /milestones/{id}/tasks | only my tasks |
| GET | /tasks/{id} | detail + resources + my time entries; 403 unless mine |
| PATCH | /tasks/{id} | {status: in_progress \| submitted}; forward-only; 409 if another milestone is active for me |
| GET | /me/time-entries?from&to | my ledger for a date range |
| POST | /tasks/{id}/time-entries | {work_date, hours, note?}; task mine and in_progress/submitted |
| PATCH | /time-entries/{id} | {work_date?, hours?, note?}; mine, task not completed |
| DELETE | /time-entries/{id} | mine, task not completed |
| GET | /milestones/{id}/notes | |
| POST | /milestones/{id}/notes | {note_text} |

Status codes: 200 read/update, 201 create, 204 delete, 400 validation, 401 no/invalid token,
403 not mine, 404 not found, 409 illegal transition / active-milestone conflict.

## 8. Dependencies on other roles → seeded for now

The employee flow needs: admin-created users (with manager_id and rates), departments, a project
with a manager; manager-built teams, milestones, tasks with predicted hours, due dates and
resources. None of that is implemented here. Seed (idempotent, in `app/db/seed.py`, which already
creates adm001, mgr001, emp001–003): add mgr002 and emp004; 2 departments; 2 projects
(INF-024 "Legacy server retirement" under mgr001 with 3 sequenced milestones; OPS-018 "Asset
inventory alignment" under mgr002 with 2); teams attached; 2–3 tasks per milestone with codes and
due dates; a few resources; a week of time entries for emp001 so Overview and My hours have data.

## 9. Foundation work before flow 1 (not employee-specific)

Status as of 2026-10-13. Flow 1 (login) is implemented end to end and the foundation below is in
place; see `README.md` (repo root) and `backend/api/README.md`.

- [x] `backend/api/` service skeleton (function.py + requirements.txt so the template discovers it).
      FastAPI + Mangum, folders per domain (`app/auth`, `app/users`, `app/core`, `app/db`).
- [x] Numbered SQL migrations in `backend/api/db/migrations/` + seed. Applied on first request per
      Lambda container (advisory-locked), tracked in `schema_migrations`. `001_create_users.sql`
      (users) and `002_create_core_tables.sql` (the other 12 tables, from the approved ER diagram).
- [x] `function.py` strips the `/api/api` prefix (CloudFront keeps it, local proxy removes it).
- [x] `Authorization` forwarded by `bin/proxy-server.js`; its preflight allow-list is now
      `Authorization, Content-Type`.
- [x] `JWT_SECRET` (random, kept in Terraform state, or `TF_VAR_aws_jwt_secret`) and `CORS_ORIGINS`
      added to the env map in `infra/locals.tf`. Not yet validated with `terraform validate`
      (terraform is not installed on this machine).
- [x] CORS restricted from `*` to `aws_cors_origins` (default `http://localhost:3000`) in both the
      Lambda Function URL config and the FastAPI middleware. Behind CloudFront the API is same-origin.
- [x] Frontend: react-router, @mui/material, @mui/icons-material, prop-types, fetch wrapper in
      `src/services/apiClient.js`, `AuthProvider` context, `ProtectedRoute`, `LoginPage`.
- [x] Shared app shell (sidebar + top bar + page header) used by all roles, in `src/layout/`.
      Role-based routes: `src/config/navigation.js` lists each role's pages and doubles as the
      route allow-list; other roles get a "no access" page. Unbuilt pages show a placeholder
      naming their spec.
- [x] pytest suite (46 tests against a real PostgreSQL database) + Postman collection in
      `backend/api/postman/`.
- [x] Seed extended in `app/db/seed.py` with departments, projects, teams, milestones, tasks,
      resources, a week of time entries and a note thread (see §8). Logins in `LOGIN.md`.
- [ ] Not yet: token refresh (client re-logs in on `401 TOKEN_EXPIRED`), login rate limiting,
      frontend component tests, deploy to LocalStack/AWS to verify.

Auth decisions: HS256 JWT, 8 h expiry, claims `sub` (user id), `username`, `role`; bcrypt cost 12;
one generic `401 INVALID_CREDENTIALS` for unknown user / wrong password / archived account; every
protected request re-reads the user so archiving revokes access immediately; token kept in
`localStorage` for the MVP (XSS trade-off accepted; revisit if cookies are preferred).
New protected routes reuse `get_current_user` / `require_roles` from `app/core/deps.py` and the
`AppError` envelope from `app/core/errors.py`.

## 10. Deferred decisions (not blocking)

A. Notes-thread placement → decided in the mockup.
B. Weekly "allocated hours" (planned hours due this week) shown in mockups → stretch.
C. Lifetime "approved" vs "logged" hours split → MVP shows logged only.
