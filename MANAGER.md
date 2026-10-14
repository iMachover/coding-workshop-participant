# Manager MVP

Source of truth: WORKSHOP_GUIDELINES.md, WORKSHOP_NOTES.md, assets/manager/*.png
(Overview and My-team; Projects-milestones / Reports / Settings exports are broken and
pending re-export). Builds on EMPLOYEE.md: same tables, same Lambda, same auth.
This page lists everything a manager can do and nothing else.

## 1. User flows (build order)

1. **Log in** (shared).
2. **Overview**: my projects at a glance, one project in focus, milestone sequence, review
   queue, people & weekly capacity, budget.
3. **Set up a project**: edit name, description, dates, budget. Create milestones with dates and
   predicted hours; sequence assigned automatically.
4. **Plan work**: create tasks in a milestone (title, description, predicted hours, due date,
   resources), assign each to an employee on the project.
5. **Review work**: open the review queue, mark submitted tasks completed or reopen them,
   approve milestone completion, close the project.
6. **Build the team**: create teams from my direct reports, add/remove members, attach/detach
   teams to my projects.
7. **Manage people**: My team table with weekly allocation and task progress; profile view with
   projects, hours, cost, progress; edit first name, last name, email of direct reports.
8. **Milestone notes**: read and reply to employee notes.

Build order: 1, 2, 3, 4, 5 (core project loop), then 6, 7, 8.

## 2. Domain rules

- **My projects** = projects where `manager_id` is me. Admin creates projects and assigns the
  manager. Manager cannot create, delete, archive, or see archived projects.
- **My direct reports** = users where `manager_id` is me, set by admin. One manager per employee.
- **Teams** are owned by a manager (`teams.manager_id`). Members must be the owner's direct
  reports. Only the project's manager attaches teams, and only their own teams.
  (Cross-manager teams on one project = stretch.)
- **Task assignee** must be on a team attached to the task's project, else 400 with a field error.
- **Milestones**: sequence = last + 1 at creation, fixed afterwards (reorder = stretch).
  Milestone N is locked until N-1 is completed.
- **One active milestone per employee across all projects** (see EMPLOYEE.md). Managers may
  create and assign tasks in future milestones to plan ahead; those tasks show Blocked or Queued
  to the employee until they can start.
- **Task review**: submitted → completed (stamps `completed_at`). Reopen: submitted or
  completed → in_progress; clears `submitted_at` and `completed_at`, keeps `started_at`.
  Logged time entries are untouched by reopen. Employee transitions stay forward-only.
- **Approve milestone** only when every task in it is completed → stamps `completed_at`, unlocks
  the next. **Close project** only when every milestone is completed → `status = closed`.
- **Budget**: manager sets `projects.budget`.
  Planned cost = Σ(task predicted_hours × assignee hourly_rate) + Σ(resource estimated_cost).
  Actual cost = Σ(logged hours × hourly_rate) + Σ(resource actual_cost where entered).
  Remaining = budget − actual. Computed, never stored. Shown per project and per milestone.
  Manager enters resource `actual_cost`.
- **Weekly capacity** per employee = 40 h; allocation shown = hours logged this week / 40,
  flagged "over" above 40.
- **Pending approvals** = my projects' tasks in submitted.
- **Hourly rate** is read-only for the manager in MVP (seeded). Editing rates = stretch.
- Every manager write goes to `audit_log` (e.g. "Manager created team A", "assigned task X to Jane").

## 3. Core actions

| Flow | Action | Writes |
|------|--------|--------|
| Overview | Stat cards, project in focus, milestone sequence, review queue, people capacity, budget | — |
| Set up | Edit project name, description, start_date, end_date, budget | projects, audit_log |
| Set up | Create milestone (name, description, start, projected end, predicted hours) | milestones, audit_log |
| Set up | Edit milestone fields (not sequence) | milestones, audit_log |
| Plan | Create task (title, description, predicted hours, due date, assignee, resources[]) | tasks, task_resources, audit_log |
| Plan | Edit task fields / reassign (while not completed) | tasks, task_resources, audit_log |
| Plan | Enter resource actual cost | task_resources, audit_log |
| Review | List submitted tasks across my projects (review queue) | — |
| Review | Mark submitted task completed | tasks.status, completed_at, audit_log |
| Review | Reopen task | tasks.status, submitted_at/completed_at cleared, audit_log |
| Review | Approve milestone (all tasks completed) | milestones.status, completed_at, audit_log |
| Review | Close project (all milestones completed) | projects.status, audit_log |
| Team | Create / rename team | teams, audit_log |
| Team | Add / remove direct report on team | team_members, audit_log |
| Team | Attach / detach team to project | project_teams, audit_log |
| People | My team table: person, role/team, weekly hours / 40, task progress %, View profile | — |
| People | Profile: projects, teams, hours, cost, progress, time entries | — |
| People | Edit direct report first_name / last_name / email | users, audit_log |
| Notes | Read / add milestone note | milestone_notes, audit_log |

## 4. Data requirements

Stored: everything in EMPLOYEE.md §5. The manager reads all tasks, time entries and resources on
their projects, and their direct reports' profiles.

Computed, never stored: per project and per milestone — planned cost, actual cost, remaining,
actual hours vs predicted, progress %, health; per employee — hours this week / 40, cost,
progress across my projects; milestone lock state; review queue; pending-approvals count.

## 5. Database changes

No new tables beyond EMPLOYEE.md v2 (which already includes `teams.manager_id`, `time_entries`,
`projects.code`, `tasks.code`, `tasks.due_date`).

Manager writes to: projects (fields + status), milestones, tasks, task_resources, teams,
team_members, project_teams, users (direct reports' name/email only), milestone_notes, audit_log.

## 6. Frontend pages (per assets/manager)

Same app shell as the employee. Sidebar: Overview, Projects, My team, Reports, Settings.

1. **Overview** (`/`): header actions: project selector, [Assign employee] (opens task-create
   drawer). Stat cards: active projects (n, on track / needs attention), budget remaining
   (actual / planned), project hours (actual / planned, % used), pending approvals.
   Project-in-focus banner: code, name, description, health, target date, progress bar,
   actual/planned cost and hours, [Edit dates & budget]. Milestone sequence: one card per
   milestone (completed / in progress / locked, dates, task counts) with lock note.
   "Ready for review" card: submitted tasks (employee, task, project · milestone, actual /
   planned h and $, [Review submission] → complete or reopen). People & weekly capacity:
   direct reports with logged / 40 h bar and task progress %. Budget card: used %.
2. **Projects** (`/projects`) [mockup pending re-export; designed from Overview]:
   projects table (code, name, dept, health, progress, planned / actual cost, hours, target end,
   Open). Open → project page: milestone list with [+ Milestone], [Approve]; tasks table per
   milestone (code, title, assignee, status, planned / actual h and $, due) with [+ Task],
   [Complete], [Reopen]; attached teams with [Attach team]; [Close project] when eligible.
   Create / edit forms in right-side drawers.
3. **My team** (`/team`): header actions [Create team], [Assign employee]. Direct team table:
   person (name, email), role / team, weekly allocation (logged / 40 h bar, free / over),
   task progress % completed, [View profile]. Search + filter. Side card: hours per team.
   Note: manager edits name and email only, not role. Profile drawer: editable name/email,
   teams, projects, per-milestone progress, hours, cost, recent time entries.
   Teams section: team name, members, attached projects, add/remove, attach/detach.
4. **Reports** (`/reports`): out of MVP until mockup re-exported. Nav item hidden.
5. **Settings** (`/settings`): same as employee (name, email, role badge).

Out of MVP (visible in mockups, omitted): forecast at completion, forecast variance, blended
rate, capacity-signal copy, notifications.

## 7. API (manager role; project-scoped routes 403 unless I manage it)

Manager-only routes depend on `require_roles("manager")` from `app/core/deps.py`; shared routes
depend on `get_current_user` and branch on `user["role"]`.

| Method | Path | Notes |
|--------|------|-------|
| GET | /manager/overview?project_id | stat cards + project in focus + milestones + review queue + people capacity |
| GET | /projects | my projects + dept + health + planned/actual cost + hours + progress |
| PATCH | /projects/{id} | name, description, start_date, end_date, budget |
| POST | /projects/{id}/close | 409 unless all milestones completed |
| GET | /projects/{id}/milestones | shared route; manager gets all-employee rollups + cost |
| POST | /projects/{id}/milestones | name, description, start_date, projected_end_date, predicted_hours |
| PATCH | /milestones/{id} | same fields; sequence not editable |
| POST | /milestones/{id}/approve | 409 unless all tasks completed; unlocks next |
| GET | /milestones/{id}/tasks | shared route; manager gets all tasks |
| POST | /milestones/{id}/tasks | title, description, predicted_hours, due_date, assigned_to, resources[] |
| PATCH | /tasks/{id} | fields, assigned_to, status: completed (from submitted) \| in_progress (reopen) |
| PATCH | /tasks/{id}/resources/{rid} | actual_cost |
| GET | /tasks?status=submitted | review queue across my projects |
| GET | /tasks/{id}/time-entries | all entries on a task on my project |
| GET / POST | /teams | my teams / create |
| PATCH | /teams/{id} | rename |
| POST / DELETE | /teams/{id}/members/{user_id} | 400 unless my direct report |
| POST / DELETE | /projects/{id}/teams/{team_id} | my project + my team |
| GET | /employees | my direct reports + hours this week / cost / progress |
| GET | /employees/{id} | detail incl. projects, teams, progress, recent time entries; 403 unless direct report |
| PATCH | /employees/{id} | first_name, last_name, email; direct reports only |
| GET / POST | /milestones/{id}/notes | shared |

Status codes as EMPLOYEE.md, plus 409 Conflict for approve / close preconditions.

## 8. Dependencies on admin → seeded for now

Admin creates users (with `manager_id`), departments, projects, assigns managers, sets rates.
Seed already includes two managers so cross-manager 403 scoping can be tested.
Replaced by real admin flows in the Admin slice.

## 9. Deferred decisions (not blocking)

A. Milestone reorder / insert-between.
B. Manager or admin editing hourly rates.
C. Teams from other managers contributing to my project.
D. Notification / escalation when an employee posts a note.
E. Reports page (await re-exported mockup).
F. Forecast at completion and variance.
