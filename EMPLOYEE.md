# Employee MVP

Source of truth: WORKSHOP_GUIDELINES.md (requirements), WORKSHOP_NOTES.md (rules per role).
Scope: the minimum an employee needs. Everything an employee can do is on this page; nothing else.

## 1. User flows (build order)

1. **Log in** with username + password. No self-registration. Accounts are created by an admin.
2. **View my work**: projects I am on (each with its owning department) → their milestones →
   my tasks, with my hours and my cost.
3. **Update task status**: assigned → in progress → submitted. Forward-only. "Completed" and
   "reopen" are manager-only.
4. **Milestone notes**: read the note thread on a milestone and add a note (conversation with manager).
5. **Edit my profile**: first name, last name, email. Nothing else.

Slices 1–3 ship first. 4 and 5 last.

## 2. Domain rules

- Each project belongs to exactly one owning department. Multiple teams, from any department,
  can contribute to a project. Department is informational for the employee (read-only label).
- Hierarchy: project → milestones → tasks. Status lives on the task.
  Milestone progress is derived from its tasks; project progress from its milestones.
  Every level shows a summary of the level below it.
- Milestones are sequenced within a project. Milestone N is locked until N-1 is completed.
- Actual hours are automatic. `started_at` is stamped on assigned→in_progress,
  `submitted_at` on in_progress→submitted. Hours are computed from the two timestamps, never stored.
  Milestone actual hours = sum of its tasks. Project actual hours = sum of its milestones.
- Pay rate: one `hourly_rate` per user, seeded by job title for MVP. Cost = actual hours × rate.
  Manager/admin editing the rate is a stretch goal.
- Resources are physical items a task needs (carts, printer parts, lightbulbs). Generic across
  departments: name, quantity, estimated cost, actual cost. Manager creates them; employee views.
- The employee sees ONLY their own hours and own cost. No project budget, no other employees' costs.
- Every employee write (status change, note, profile edit) is written to the audit log.

## 3. Core actions

| Flow | Action | Writes |
|------|--------|--------|
| Login | Submit username+password → JWT | — |
| Login | Log out (client drops token) | — |
| View my work | List my projects: owning department, predicted hours, my actual hours, my cost, progress | — |
| View my work | List a project's milestones: dates, overall progress, my progress, status, lock state | — |
| View my work | List my tasks in a milestone: status, predicted h, actual h, cost, resources | — |
| View my work | Open one task: description, resources, timestamps | — |
| Task status | Start task (assigned → in_progress) | tasks.status, tasks.started_at, audit_log |
| Task status | Submit task (in_progress → submitted) | tasks.status, tasks.submitted_at, audit_log |
| Notes | Read milestone note thread | — |
| Notes | Add note | milestone_notes, audit_log |
| Profile | View my profile | — |
| Profile | Update first_name / last_name / email | users, audit_log |

## 4. Data requirements

Stored (read by employee): own user row; projects I belong to via team membership, each with its
owning department; milestones;
my tasks; task resources; milestone notes; audit log entries I generate.

Computed, never stored: task actual hours; milestone/project actual hours and cost (sums);
progress % (task counts by status); milestone lock state (previous milestone status).

## 5. Database tables

Shared tables, listed in full so later roles extend rather than redesign. Employee slice WRITES
only to `tasks` (status, started_at, submitted_at), `milestone_notes`, `users` (own name/email)
and `audit_log`. Everything else is read-only here and seeded.

- **users**: id, username char(6) unique, password_hash, first_name, last_name, email unique,
  job_title, role enum(admin|manager|employee), hourly_rate numeric, manager_id FK users null,
  is_archived bool, created_at, updated_at
- **departments**: department_id PK, department_name unique
- **projects**: id, name, description, department_id FK departments (not null, one owning
  department per project), manager_id FK users, start_date, end_date, budget numeric,
  status enum(active|closed), is_archived bool, created_at, updated_at
- **teams**: id, name, created_at — unchanged; teams are not tied to a department, so teams from
  several departments can contribute to one project via project_teams
- **team_members**: team_id FK, user_id FK — composite PK
- **project_teams**: project_id FK, team_id FK — composite PK
- **milestones**: id, project_id FK, name, description, sequence int, start_date,
  projected_end_date, predicted_hours numeric, status enum(not_started|in_progress|completed),
  completed_at, created_at, updated_at — unique(project_id, sequence)
- **tasks**: id, milestone_id FK, assigned_to FK users, title, description, predicted_hours numeric,
  status enum(assigned|in_progress|submitted|completed), started_at, submitted_at, completed_at,
  created_at, updated_at
- **task_resources**: id, task_id FK, name, quantity int, estimated_cost numeric,
  actual_cost numeric null
- **milestone_notes**: id, milestone_id FK, user_id FK, note_text, created_at
- **audit_log**: id, actor_user_id FK, action, entity_type, entity_id, details jsonb, created_at

Indexes (query-driven): tasks(assigned_to), tasks(milestone_id), milestones(project_id),
team_members(user_id), project_teams(team_id), projects(department_id),
milestone_notes(milestone_id), audit_log(actor_user_id).

"Which projects am I on" = users → team_members → project_teams → projects → departments
(join for the department name only; membership logic is unchanged).

## 6. Frontend pages

1. **Login**: username, password, submit, inline error.
2. **Employee dashboard** — one page, no page-level scroll, three stacked panels each with its own
   scroll (Material UI):
   - Header: app name, my name, profile link, logout.
   - Summary strip: active projects, tasks in progress, my hours, my cost.
   - Panel 1 PROJECTS table: name, department, manager, start, end, my hours, my cost, progress bar.
   - Panel 2 MILESTONES of selected project: seq, name, dates, overall progress bar,
     my progress bar, status; locked rows greyed.
   - Panel 3 MY TASKS of selected milestone: title, status chip, predicted h, actual h, cost,
     resource count, Start / Submit button by status.
   - Right-side drawer on task click: description, resources list, timestamps.
   - Milestone notes thread + input (placement decided in mockup).
   - Loading, empty and error states on every panel. Toasts on save success/failure.
3. **Profile**: first name, last name, email, save.

UI process: clickable HTML mockup with fake data → user review → lock → then React.

## 7. API

One Lambda service `backend/api/`, FastAPI + Mangum, folders per domain
(auth, users, projects, milestones, tasks, notes), each routes → service → repository.
All endpoints except login require `Authorization: Bearer <JWT>`. Server scopes every query to the
token's user. Errors: `{ "success": false, "error": { "code", "message", "fields"? } }`.

| Method | Path | Notes |
|--------|------|-------|
| POST | /auth/login | {username, password} → {token, user}. Generic error on failure. Rate-limit later. |
| GET | /me | profile |
| PATCH | /me | {first_name?, last_name?, email?} |
| GET | /me/projects | my projects + owning department {id, name} + my hours/cost/progress |
| GET | /projects/{id}/milestones | 403 unless I am on the project |
| GET | /milestones/{id}/tasks | only my tasks |
| GET | /tasks/{id} | detail + resources; 403 unless assigned to me |
| PATCH | /tasks/{id} | {status: in_progress \| submitted}; forward-only enforced; stamps timestamps |
| GET | /milestones/{id}/notes | |
| POST | /milestones/{id}/notes | {note_text} |

Status codes: 200 read/update, 201 create, 400 validation, 401 no/invalid token,
403 not mine / illegal transition, 404 not found.

## 8. Dependencies on other roles → seeded for now

The employee flow cannot work until an admin has created users and a project, a manager has
built teams, milestones and tasks, and rates are set. None of that is implemented in this slice.
Seed (idempotent, bcrypt-hashed passwords): 2 departments (e.g. Infrastructure, Facilities);
1 admin, 1 manager, 3 employees with job titles and rates; 1 project "Decommission 1000 servers"
owned by Infrastructure; 1 team on that project; 3 sequenced milestones
(Scope & analyze → Decom 200 → Decom 500); 2–3 tasks per milestone per employee; a few resources.
Replaced by real manager/admin flows as those slices land.

## 9. Foundation work before flow 1 (not employee-specific)

- `backend/api/` service skeleton (function.py + requirements.txt so the template discovers it).
- Numbered SQL migrations in `backend/api/db/migrations/` + seed file. Lambda applies pending
  migrations and the idempotent seed on cold start, tracked in `schema_migrations`.
- FastAPI app mounted so it accepts `rawPath` both with and without `/api/api` prefix
  (local proxy strips it, CloudFront does not).
- Add `Authorization` to the forwarded-header allowlist in `bin/proxy-server.js`
  (it currently drops it, so JWT would fail locally only).
- Add `JWT_SECRET` to the env map in `infra/locals.tf`.
- Restrict CORS origin from `*` to the frontend origin.
- Frontend: install react-router, @mui/material, axios/fetch wrapper in `src/services/`,
  AuthProvider context, protected route.
- Postman collection + pytest setup.

## 10. Deferred decisions (not blocking)

A. Actual hours = wall-clock difference for MVP. Timestamps are stored, so switching to
   8h/day business-hours math later is a formula change only.
B. "One employee for one milestone at a time" is a manager-side assignment rule → MANAGER.md.
C. Notes-thread placement (drawer vs below milestones) → decided in the mockup.
