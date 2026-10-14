# Admin MVP

Source of truth: WORKSHOP_GUIDELINES.md, WORKSHOP_NOTES.md, assets/admin/*.png.
Builds on EMPLOYEE.md and MANAGER.md: same tables, same Lambda, same auth.
This page lists everything an admin can do and nothing else.

## 1. User flows (build order)

1. **Log in** (shared).
2. **Overview**: portfolio at a glance, manager coverage, recent audit activity.
3. **Manage people**: create users of any role, edit a user (name, email, job title, role,
   department, manager, hourly rate), archive and restore.
4. **Manage projects**: create a project and assign its manager, edit project (name, description,
   department, manager, dates, budget), archive and restore.
5. **Audit activity**: browse, search and filter every change in the system; view the diff.
6. **Archives**: list archived projects and users; restore.
7. **Manage departments**: create and rename departments (name + 3-letter prefix).
8. **Settings**: edit own name and email.

Build order: 1, 3, 4, 5 (the admin's core duties and the MVP audit requirement), then 2, 6, 7, 8.

## 2. Domain rules

- Admin sees everything organization-wide, including archived records. Admin does NOT assign
  employees to teams, attach teams to projects, create tasks, or approve milestones; those belong
  to the project's manager.
- **Create user**: first_name, last_name, email, job_title, role, department_id, manager_id
  (required when role = employee, must be an active manager; must be null otherwise),
  hourly_rate, temporary password. Server generates a unique 6-character username
  ([a-z0-9], retry on collision) and returns it once. UI shows a copy-credentials dialog.
- **Edit user**: any of the fields above except username; password reset = stretch.
- **Role change** is admin-only. Blocked (409 with blocker list) while a manager owns active
  projects or an employee has not-completed tasks. employee → manager clears manager_id;
  → employee requires a manager_id.
- **Archive user**: same blockers as role change. Archive sets is_archived; login is revoked at
  once; the user disappears from pickers and team lists; history is kept. Restore flips the flag.
  Admin cannot archive themselves or the last active admin.
- **Create project**: name, description, department_id, manager_id (active manager),
  start_date ≤ end_date, budget ≥ 0. Code = department prefix + '-' + zero-padded per-department
  counter (INF-025), generated server-side. Admin may later change any of these fields including
  the manager. Every project always has exactly one manager.
- **Archive project**: allowed at any time. Hidden from manager and employee views; milestones,
  tasks, time entries untouched. Restore brings it back as it was.
- **Departments**: department_name unique, prefix char(3) unique upper-case. Create and rename
  only; delete/archive = stretch.
- **Codes**: projects PREFIX-### (per department), tasks TSK-### (global sequence),
  users USR-### and teams TEAM-## formatted from the id for display only.
- **Audit log** records every write by every role: actor, action (created, updated, archived,
  restored, assigned, submitted, completed, reopened, approved, closed, logged_hours, noted),
  entity_type, entity_id, entity_code, summary, details {before, after} with changed fields only.
  Written by a shared helper inside the same transaction as the change. Append-only.
- Lists are paginated (page, limit ≤ 100) and searchable; the org may have 50,000 employees.
- Health, progress, cost figures are the derived values defined in EMPLOYEE.md / MANAGER.md.

## 3. Core actions

| Flow | Action | Writes |
|------|--------|--------|
| Overview | Stat cards: active projects, portfolio budget (actual to date), hours invested, managers; portfolio table; manager coverage; latest audit rows | — |
| People | List users: search, filter by role / department / archived; paginated | — |
| People | Create user (username generated, returned once) | users, audit_log |
| People | View user profile: projects, teams, hours, cost, manager | — |
| People | Edit user fields incl. role, manager, department, rate | users, audit_log |
| People | Archive / restore user (blockers enforced) | users.is_archived, audit_log |
| Projects | List all projects incl. archived filter; paginated | — |
| Projects | Create project (code generated) | projects, departments.next_project_seq, audit_log |
| Projects | Edit project incl. manager reassignment | projects, audit_log |
| Projects | Archive / restore project | projects.is_archived, audit_log |
| Departments | List / create / rename | departments, audit_log |
| Audit | List with search (actor, record code, summary), filters (action, entity_type, actor, date range); paginated | — |
| Audit | View one entry with before/after diff | — |
| Archives | List archived projects + users; restore | users / projects.is_archived, audit_log |
| Settings | Edit own first_name / last_name / email | users, audit_log |

## 4. Data requirements

Stored: all tables. Admin writes users, projects, departments; reads everything.
Computed: portfolio totals (budget, actual cost, planned and actual hours), per-manager active
project count and budget owned, project health/progress, per-user weekly hours, blocker lists
for archive and role change, archived-records union.

## 5. Database changes (migration with this slice)

- departments: add `prefix char(3) not null unique`, `next_project_seq int not null default 1`.
- users: add `department_id FK departments null`; index (department_id); partial index on
  (role) where is_archived = false.
- tasks: `code` filled from sequence `task_code_seq` (TSK-### formatting in app).
- audit_log: final shape = id, actor_user_id FK, action text, entity_type text, entity_id bigint,
  entity_code text, summary text, details jsonb, created_at; indexes (created_at desc),
  (actor_user_id), (entity_type, entity_id). Supersedes the shorter line in EMPLOYEE.md §5.
- Constraint: projects.manager_id not null (every project has a manager).

## 6. Frontend pages (per assets/admin)

Same app shell. Sidebar: Overview, Projects, People & access, Audit activity, Archives, Settings.

1. **Overview** (`/`): [Create user] [Create project]. Stat cards: active projects (on track /
   needs attention), portfolio budget (actual to date), hours invested (planned), people &
   ownership (managers count). Portfolio table: code, name, dept, manager, health, delivery %,
   actual / budget, deadline, open. "Accountable by design": manager, active projects, budget
   owned. Recent audit activity (latest 4) → Audit page.
2. **Projects** (`/projects`): [New project]. Banner: actual hours, actual / total budget.
   Table: code, name, manager, dept, health, progress, actual / planned hours, cost / budget,
   target end, Open. Search + status filter (active / closed / archived). Open → project drawer:
   details, [Edit] (incl. manager reassignment), milestones read-only, [Archive].
   Create / edit forms in drawers.
3. **People & access** (`/people`): [Create user]. Table: person (name, email, USR code),
   role badge + department, weekly hours / 40, manager, View profile. Search + role / department
   filter. Profile drawer: all editable fields, projects, teams, hours, cost, [Archive].
   Create-user drawer → credentials dialog showing generated username + temp password once.
4. **Audit activity** (`/audit`): table: time, actor, action badge, record code, summary,
   View change. Search + action / entity filters + date range. Pagination. View change → drawer
   with before / after fields.
5. **Archives** (`/archives`): table: code, name, type (Project | User), archived date, state,
   [Restore record]. Search.
6. **Settings** (`/settings`): own name, email, role badge; Departments section: list, create,
   rename (admin only).

Out of MVP (visible in mockups, omitted): notification preferences, planning-week selector,
capacity-signal copy.

## 7. API (admin role via `require_roles("admin")`)

| Method | Path | Notes |
|--------|------|-------|
| GET | /admin/overview | stat cards + portfolio + manager coverage + latest audit |
| GET | /users?q&role&department_id&archived&page&limit | paginated |
| POST | /users | create; returns user + generated username |
| GET | /users/{id} | profile incl. projects, teams, hours, cost |
| PATCH | /users/{id} | fields incl. role, manager_id, department_id, hourly_rate |
| POST | /users/{id}/archive | 409 + blockers if active projects / open tasks / last admin / self |
| POST | /users/{id}/restore | |
| GET | /projects?q&status&archived&department_id&manager_id&page&limit | admin: all projects |
| POST | /projects | create; code generated |
| GET | /projects/{id} | detail + milestones summary |
| PATCH | /projects/{id} | admin fields incl. manager_id, department_id |
| POST | /projects/{id}/archive | |
| POST | /projects/{id}/restore | |
| GET / POST | /departments | list (all roles may GET) / create |
| PATCH | /departments/{id} | rename, prefix |
| GET | /audit?q&action&entity_type&actor_id&from&to&page&limit | paginated, newest first |
| GET | /audit/{id} | entry with details diff |
| GET | /archives?q&type&page&limit | archived projects + users union |
| PATCH | /me | shared |

Status codes as EMPLOYEE.md; 409 for archive / role-change blockers.

## 8. Dependencies

None: admin is the root role. Seed already creates adm001. Seeded departments, users and
projects remain for development; real records are created through these flows.

## 9. Deferred decisions (not blocking)

A. Force password change on first login; password reset by admin.
B. Department archive / delete.
C. Bulk user import (CSV).
D. Notifications for account and ownership changes.
E. Full-text search on audit summaries (ILIKE is enough for MVP).
