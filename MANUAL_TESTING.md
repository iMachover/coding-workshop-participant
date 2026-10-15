# Manual test checklist

A click-through of every page and action in the app, one section per role, then one flow that
passes work between all three roles. Tick each box as you go. Anything that doesn't match is a
bug: note the step number and what you saw.

## Before you start

1. Start the app (`./bin/start-dev.sh`, or the backend and frontend separately; see
   [README.md](README.md#running-it)) and open http://localhost:3000.
2. Start from a freshly seeded database. The steps below assume the seed data in
   [LOGIN.md](LOGIN.md) and nothing else. If you've run the Playwright tests or clicked around
   before, you'll see extra "E2E …" records and some numbers will differ. To reseed, run
   `python -m app.db.bootstrap` against an empty database.
3. Use a normal window for one account and a private window for a second, so you can watch two
   roles side by side.
4. Do the sections **in order**. Some steps change the seed data, and later steps rely on that.

| Account | Password | Role | Who |
|---------|----------|------|-----|
| `adm001` | `Admin123!` | admin | Ada Admin |
| `mgr001` | `Manager123!` | manager | Morgan Lee: INF-024, team Server Ops |
| `mgr002` | `Manager123!` | manager | Taylor Brooks: OPS-018, team Asset Control |
| `emp001` | `Employee123!` | employee | Sam Rivera: task in progress, recent hours |
| `emp002` | `Employee123!` | employee | Priya Natarajan: task waiting for review |
| `emp003` | `Employee123!` | employee | Jordan Okafor: nothing started, one Blocked task |
| `emp004` | `Employee123!` | employee | Casey Nguyen: on mgr002's project |
| `emp005` | `Employee123!` | employee | Alex Kim: no manager, teams or tasks |

Things to watch on every page:

- [ ] Every save or action shows a toast at the bottom of the screen.
- [ ] Error messages from the API appear next to the field or in a toast, never as a blank screen.
- [ ] Side panels stay open after a page reload, because they are kept in the URL
      (`?selected=`, `?milestone=`, `?task=`, `?person=`, `?team=`, `?log=`).
- [ ] The browser Back button closes the panel you just opened.
- [ ] At phone width (about 400 px) the sidebar folds into a menu button and nothing scrolls
      sideways except wide tables.

---

## 1. Sign-in and access (every role)

### 1.1 Login page

- [ ] Opening any page while signed out goes to `/login`.
- [ ] **Sign in** with both fields empty shows "Enter your username" and "Enter your password".
- [ ] A wrong password shows "Invalid username or password".
- [ ] A username that doesn't exist shows the same message.
- [ ] `emp001` / `Employee123!` signs in and lands on Overview.
- [ ] Sign out, open http://localhost:3000/hours, sign in again: you land on My hours, not Overview.

### 1.2 Shell

- [ ] The sidebar shows the ACME logo, "<Role> workspace" with your job title, your role's pages,
      and your name with "<Role> · <username>" at the bottom.
- [ ] The top bar shows "Workspace › <page name>" and today's date.
- [ ] The log out button (next to your name) returns you to the login page. Back doesn't get you in again.

### 1.3 Each role sees only its own pages

Sign in as each role and check the sidebar:

- [ ] **Employee:** Overview, My projects, My teams, My hours, Settings.
- [ ] **Manager:** Overview, Projects, My team, Reports, Settings.
- [ ] **Admin:** Overview, Projects, People & access, Audit activity, Archives, Settings.

Type another role's URL into the address bar:

- [ ] As `emp001`, `/people`, `/audit`, `/archives`, `/team` and `/reports` each show
      "This page isn't available for your role", and the breadcrumb says "No access".
- [ ] As `mgr001`, `/people`, `/audit`, `/archives`, `/hours` and `/teams` show the same.
- [ ] As `adm001`, `/team`, `/reports`, `/hours` and `/teams` show the same.
- [ ] `/does-not-exist` shows "There's nothing at this address" for any role.

---

## 2. Admin (`adm001`)

### 2.1 Overview

- [ ] Four stat cards: Active projects, Portfolio budget, Hours invested, People.
- [ ] **Project portfolio** lists INF-024 and OPS-018 with manager, health, delivery %,
      actual / budget and deadline.
- [ ] Search "asset" leaves only OPS-018. The filter switches between "Active projects" and "Needs attention".
- [ ] Clicking a row opens that project on the Projects page with its panel open.
- [ ] **Managers** lists Morgan Lee and Taylor Brooks with their project count and budget.
- [ ] **Recent audit activity** shows the seeded events, newest first. **All activity** opens Audit activity.
- [ ] **Create user** opens People & access with the create panel open.
- [ ] **Create project** opens Projects with the create panel open.

### 2.2 Settings and departments

Do this before creating projects, so you have a new department to use.

- [ ] **Account** shows your first name, last name and email. **Save** stays disabled until you change something.
- [ ] Change your last name, save: toast "Profile saved", and the sidebar name updates.
      Change it back.
- [ ] An invalid email (`abc`) is refused with a message on the field.
- [ ] There is no Notifications card.
- [ ] **Departments** lists Infrastructure (INF) and Operations (OPS) with their next code
      (INF-025, OPS-019), people and active projects.
- [ ] **New department**: name "Quality Assurance", prefix `qas`. Saves as QAS (upper case),
      toast "Department Quality Assurance (QAS) created", next code QAS-001.
- [ ] A prefix of 2 or 4 letters, or digits, is refused.
- [ ] A prefix already in use (`INF`) is refused.
- [ ] **Rename** Quality Assurance to "Quality" and back. Toast "Department … saved".

### 2.3 Projects

- [ ] The banner says "2 active projects" with actual / planned hours, cost / budget,
      "Needing attention" and "Without a team" (0).
- [ ] The table shows code, name, manager, department, team names, health, progress, hours, cost / budget and target end.
- [ ] Search by code (`OPS`), by name and by manager name (`Brooks`). The filter works: On track, At risk and
      No team (admin and manager only; lists projects without a team, whose health shows Pending).
      A search with no match shows "No projects match these filters…".
- [ ] **Open** INF-024. The panel shows status, code, department · manager, description, dates,
      hours, cost / budget, delivery and teams (Server Ops).
- [ ] The **Milestone dependency chain** shows 01 Completed (Approved <date>), 02 In progress, 03 Locked.
- [ ] Clicking 02 opens the milestone panel with every task and its assignee. The admin has no
      **Add task**, **Approve** or note box.
- [ ] Clicking a task opens Task details with no action buttons.
- [ ] **Edit project & manager**: the form has name, description, accountable manager, dates and
      budget (no department, since the code is fixed). Change the budget, **Save changes**:
      toast "Project saved", and the panel and table update. Put it back.
- [ ] An end date before the start date is refused.

**New project:**

- [ ] **New project**: name "Manual test project", department Quality Assurance, manager
      Morgan Lee, start today, end in a month, budget 10000. **Create project**: toast
      "Project QAS-001 created", and its panel opens.
- [ ] It shows a "No team assigned" badge and the amber note "No team is assigned yet. Morgan Lee
      assigns teams from the My team page."
- [ ] Settings → Departments now shows Quality Assurance with next code QAS-002 and 1 active project.

**Archive a project (QAS-001 is used later, so use a throwaway one):**

- [ ] Create "Archive me" in Operations for Taylor Brooks (code OPS-019).
- [ ] **Archive project** → **Confirm archive**: toast "Project OPS-019 archived. Restore it from
      Archives." It leaves the Projects list.

### 2.4 People & access

- [ ] The register lists all 8 accounts with code, role / department, weekly allocation bar and manager.
- [ ] The **Access** card counts Employees 5, Managers 2, Admins 1, Archived 0.
- [ ] Search by name. The role, department and active / archived filters work. Pagination and
      **Per page** work.
- [ ] **View profile** on Sam Rivera shows username, reports to Morgan Lee, team Server Ops,
      hourly rate, cost this week, lifetime logged, weekly allocation, projects, progress by
      milestone and recent time entries.
- [ ] Clicking a project in the profile opens that project's panel.

**Create a user** (this person is used in section 5):

- [ ] **Create user**: first "Test", last "Tester", email `test.tester@example.com`, job title
      "QA Engineer", role Employee, department Quality Assurance, reports to Unassigned,
      rate 50, temporary password `Tester123!`. **Create account**.
- [ ] The dialog "Account created for Test Tester" shows a 6-character username and the password.
      **Copy credentials** changes to "Copied". **Write the username down**, then **Done**.
- [ ] A password under 8 characters is refused. An email already in use is refused.

**Edit and role rules:**

- [ ] Open Morgan Lee → **Edit profile & role** → change role to Employee → **Save changes**.
      It is refused, because Morgan manages a project and has direct reports.
- [ ] Morgan's profile shows **Archive account** disabled, with
      "Cannot be archived yet: Manages 2 active projects…; Has 3 direct reports…" (INF-024 and
      the QAS-001 you just created).
- [ ] Your own profile (Ada Admin) can't be archived: "You cannot archive your own account".
- [ ] Sam Rivera can't be archived: "Has N tasks not completed yet".

**Archive and restore an account:**

- [ ] Open Alex Kim (`emp005`) → **Archive account** → **Confirm archive**: toast "Alex Kim archived".
      The Access card shows Archived 1.
- [ ] In a private window, sign in as `emp005`: "Invalid username or password".
- [ ] Back in People & access, filter Archived → Alex Kim → **Restore account**: toast "Alex Kim restored".
- [ ] `emp005` can sign in again.

### 2.5 Archives

- [ ] The page lists OPS-019 "Archive me" (and nothing else on a fresh seed). The subtitle counts
      projects and accounts.
- [ ] Search works. The **Projects** / **Users** / **Projects and users** filter works.
- [ ] **Restore record** opens "Restore archived record?" with what restoring does. **Cancel** closes it.
- [ ] **Confirm restore**: toast "OPS-019 Archive me restored". It leaves Archives and is back on Projects.
- [ ] Archive OPS-019 again, so it doesn't get in the way of the manager checks later.

### 2.6 Audit activity

- [ ] Events are listed newest first: your department, project, user, archive and restore actions,
      then the 9 seeded events.
- [ ] Each row has time, actor (name and role), an action chip, the record code and a summary.
- [ ] Search by actor name, by record code (`INF-024`) and by summary text.
- [ ] Filter by action (Archived), by record type (Project, User…) and by actor. Each narrows the list.
- [ ] **From** / **To** dates narrow it. "To" can't be set before "From".
- [ ] A search with no match shows "No events match this search…".
- [ ] **View change** on your budget edit opens "Audit event details" with when, actor, record,
      event id and a Field / Before / After table showing the old and new budget.
- [ ] The panel has no edit or delete buttons ("Read-only event").

---

## 3. Manager (`mgr001`, then `mgr002`)

### 3.1 Overview (`mgr001`)

- [ ] **Project in focus** lists INF-024 and QAS-001 (created in 2.3). Switching changes the whole page.
- [ ] Stat cards: Your active projects, Budget remaining, Project hours, Pending approvals (1).
- [ ] With INF-024 in focus: the banner shows its progress, cost, hours and budget.
      **Open project** opens its panel.
- [ ] **Milestone sequence** shows 01 / 02 / 03. Clicking one opens its milestone panel.
- [ ] **People & weekly capacity** shows Sam, Priya and Jordan with hours / 40 h.
      Clicking a person opens their profile. **My team** opens My team.
- [ ] **Ready for review** lists "Cut over DNS and load balancer" (Priya).
      **Review submission** opens "Review completion request".
- [ ] **Budget pulse** shows planned, actual and remaining cost.
- [ ] **Assign employee** opens the milestone panel of the milestone being planned.

### 3.2 Projects (`mgr001`)

- [ ] Only INF-024 and QAS-001 are listed, not OPS-018.
- [ ] Open INF-024 → **Edit dates & budget**: the form has name, description, dates and budget,
      plus "The accountable manager is set by an administrator." No manager or department field.
      Save a small change and put it back.
- [ ] Open QAS-001: amber note "No team is working on this project yet…" with an **Open My team** link.

**Milestones:**

- [ ] On QAS-001, **Add dependent milestone**: "Build", dates inside the project's dates, 10 planned
      hours. The form says "This becomes the first milestone of the project." and the project's date
      range. The date pickers do not offer days outside it. **Add milestone**: toast "Milestone 01 added".
- [ ] Add a second one, "Sign-off", with a start date inside Build's dates. **Add milestone** shows
      "Overlaps milestone 01 · Build (…)" under Start date. Move it to start after Build ends: it saves.
      The form says "Depends on 01 · Build. It stays locked until that one is approved." The chain
      shows 02 as Locked.
- [ ] Open milestone 01 → **Add task**: amber "Nobody can be assigned yet: attach one of your
      teams to this project first (My team)." (This is fixed in section 5.)
- [ ] **Approve milestone completion** is disabled with "Add at least one task before approving."

**Review work on INF-024:**

- [ ] Open milestone 02 "Workload migration". Approve is disabled with "3 of 4 tasks are not completed yet."
- [ ] **Add task** lists only Server Ops members (Sam, Priya, Jordan). Create "Manual check task"
      for Jordan, 2 h, due next week: toast "Task INF-… created", and it appears in the table as Assigned.
- [ ] Under **Due date** the form shows the milestone's date range, and the picker offers no days outside it.
      Type a due date after the milestone ends: **Create task** shows "Must be within the milestone dates (…)".
- [ ] **Post note** with "Reply to the team" text. It appears in **Milestone conversation** with your name and time.
- [ ] Open "Cut over DNS and load balancer" (Completion requested). The panel title is
      "Review completion request", with Priya's logged hours.
- [ ] **Request changes**: toast "Returned to Priya Natarajan for changes". The status goes back to
      In progress and it leaves Ready for review. *(Priya resubmits in 4.2.)*
- [ ] Open a completed task in milestone 01 → **Reopen task** is offered. Don't click it.

### 3.3 My team (`mgr001`)

**Direct reports:**

- [ ] Lists Sam, Priya and Jordan with weekly allocation and task progress.
- [ ] Search works. The capacity filter (All / Over capacity / Has free hours) works.
- [ ] **View profile** on Sam: **Edit name & email** only (no role, rate or manager fields).
      Change his email and put it back: toast "Profile saved".
- [ ] **Release from your reports** on Sam → **Confirm release** is refused, because he has open tasks.

**Assign employee:**

- [ ] **Assign employee**: the Employee picker shows your own people and unassigned ones
      (Alex Kim, Test Tester), but never Casey Nguyen (mgr002's).
- [ ] The **Job title** filter and **Search by name** narrow the list.
- [ ] Pick Alex Kim, team "No team yet" → toast "Alex Kim now reports to you". He appears in Direct reports.
- [ ] Open Alex → **Release from your reports** → **Confirm release**. It works (no open tasks),
      and he's back in the pool for 4.5.

**Teams:**

- [ ] **Teams** shows Server Ops with members, project INF-024 and **Manage team**.
- [ ] The project filter works: All teams / Not on a project / INF-024.
- [ ] **Create team**: "Spare team", no members, project "None yet" → toast "Team Spare team created".
      It shows "Not on a project" and appears in **Needs a project**.
- [ ] **Manage team** on Spare team:
  - [ ] **Rename** to "Spare crew": toast "Team renamed".
  - [ ] **Add a person** → Jordan → **Add to team**: toast "Jordan Okafor added to Spare crew".
  - [ ] Remove Jordan (✕ on his chip) asks for confirmation. **Confirm removal**: toast "… removed from Spare crew".
  - [ ] **Attach to a project** → INF-024 → **Attach**: toast "Spare crew assigned to INF-024".
  - [ ] Detach INF-024 (✕) → **Confirm removal**: toast "Spare crew removed from INF-024".
- [ ] **Hours per team** shows each team's hours this week against capacity.

### 3.4 Reports (`mgr001`)

- [ ] Stat cards: Actual project cost, Total budget (% used, remaining), Hours (planned and
      remaining), Over-allocated people (names, or "Nobody above 40 h this week").
- [ ] **Hours by project** shows INF-024 and QAS-001, actual against planned. Clicking one opens its panel.
- [ ] **Weekly resource cost** chart has 5 weeks of bars. Hover or read the label for each week's cost.
- [ ] **Planning note** names the project that needs attention, with budget and hours remaining.
      **Review projects** opens it.
- [ ] **Export CSV** downloads `reports-<monday>.csv`, one row per project. Open it and check the
      figures match the page.

### 3.5 Settings (`mgr001`)

- [ ] Same Account card as the admin. Edit and restore your name.
- [ ] No Departments card.

### 3.6 A second manager only sees their own work (`mgr002`)

- [ ] Overview, Projects and Reports show only OPS-018 (and not the archived OPS-019).
- [ ] Ready for review is empty: "Nothing to review…".
- [ ] My team shows only Casey Nguyen and team Asset Control.
- [ ] Copy an INF-024 project link from `mgr001`'s window (`/projects?selected=<id>`) and open it
      as `mgr002`. The panel doesn't load the project.
- [ ] Assign employee doesn't offer Sam, Priya or Jordan.

---

## 4. Employee (`emp001` … `emp005`)

### 4.1 `emp001`: work in progress

**Overview:**

- [ ] Stat cards: Assigned projects (1, Infrastructure · Morgan Lee), Your hours this week
      (of 40 h), Your cost this week (with your rate), Your task completion.
- [ ] The banner "Your active milestone · INF-024" shows Workload migration, health, due dates,
      team progress, your actual / planned hours and cost, and "Next milestone: Decommission and disposal · locked".
- [ ] **Your assigned work** lists your open tasks. Clicking the project name opens My projects with
      that project's panel. Clicking a row opens Task details.
- [ ] **Your hours** card: logged this week, available, lifetime hours and cost.

**My projects:**

- [ ] Only INF-024. The columns say "Your hours" and "Your cost". No **New project** button.
- [ ] The panel shows "Your actual / planned hours" and "Your actual / planned cost", with no edit or archive.
- [ ] Milestone 02's panel shows only your tasks, with no Assignee column.
- [ ] **Post note** ("Ask a question or report a blocker") adds a note to the milestone conversation.

**Tasks and hours:**

- [ ] Open "Migrate file services to new cluster" (In progress). It shows resources (licence,
      storage array), your logged hours and **Log hours on this task**.
- [ ] **Log hours on this task** opens Log hours with that task preselected and today's date.
  - [ ] Log 1.5 h with a note: toast "1.5 h logged on INF-…". The overview and task totals update.
  - [ ] A future date can't be picked. Typing one in is refused.
  - [ ] 0 h, or 25 h, is refused.
  - [ ] Logging past 24 h on the same day (for example 23 h more today) is refused.
- [ ] **Submit for approval**: toast "Submitted to Morgan Lee for approval". The status becomes
      "Completion requested", with "This request is with Morgan Lee…".
- [ ] You can still log hours on a submitted task.
- [ ] Open "Update runbooks for migrated services" (Assigned) → **Start task**: toast "Task started".

**My hours:**

- [ ] Stat cards: Logged this week, Weekly capacity (h still free), Your cost this week, Lifetime logged.
- [ ] **Your time ledger** shows this week's entries with date, task, note, project, task status, hours and cost.
- [ ] The ‹ (previous week) arrow shows last week. **This week** returns. › is disabled on the current week.
- [ ] A week with nothing shows "Nothing was logged that week."
- [ ] Search by task code or note text.
- [ ] **View / correct** on today's entry: **Save correction** is disabled until you change
      something. Change the hours: toast "Time entry corrected", and the totals update.
- [ ] **Remove entry** → the confirmation names the hours and task → **Confirm removal**:
      toast "… removed from INF-…".
- [ ] An entry on a completed task (go back a few weeks if needed) shows **View** only, with
      "This task is completed and approved, so its hours are final."
- [ ] **Export CSV** downloads `hours-<monday>.csv` with the entries shown. It is disabled on an empty week.
- [ ] **Log hours** in the header opens the panel with a task picker listing only your in-progress
      and submitted tasks.

**My teams:**

- [ ] Server Ops is listed as "Your active team", with project INF-024 · Workload migration and your progress.
- [ ] The state filter (Active / Queued / No work in progress) and health filter work. Search works.
- [ ] **View team** → the panel shows the manager (Morgan),
      the project with "Your current milestone", team and your own progress meters, and **Open project**.
- [ ] **People on this team** lists teammates without their hours, cost or account details.
- [ ] **Your manager** card shows your manager. **My projects** opens My projects.

**Settings:**

- [ ] Same Account card. Edit and restore your name.
- [ ] **Your access** explains that passwords are set by an administrator.

### 4.2 `emp002`: work sent back for changes

- [ ] "Cut over DNS and load balancer" is In progress again (after 3.2's Request changes).
- [ ] **Submit for approval** again.
- [ ] Switch to `mgr001`: it is back in Ready for review. **Approve completion**: toast
      "Task approved. The milestone stays open until every task is approved."
- [ ] Back as `emp002`: the task is Completed, "Approved by Morgan Lee · <time>". Its hour entries are now View only.
- [ ] "Remove racks and arrange recycling" (milestone 03) shows **Blocked**.

### 4.3 `emp003`: nothing started, one task blocked

- [ ] Before starting anything, **Log hours** says "Nothing to log hours on. Start one of your assigned tasks first…".
- [ ] "Wipe and certify drives" shows Blocked, the reason "the milestone before this one must be
      completed and approved first", and a disabled **Waiting for milestone approval** button.
- [ ] "Validate backups after migration" → **Start task**. Now Log hours offers it.
- [ ] "Manual check task" (created in 3.2) is listed as Assigned.

### 4.4 `emp004`: the other manager's project

- [ ] Only OPS-018 and team Asset Control. Nothing from INF-024 anywhere.
- [ ] "Scan asset tags in datacenter A" is In progress. "Reconcile register against scans" is Blocked.
- [ ] Opening an INF-024 link (`/projects?selected=<id>`) doesn't show the project.

### 4.5 `emp005`: not on any team

- [ ] Overview: "Not on a project yet", and "No active milestone".
- [ ] My projects: "You are not on a project yet. Your manager assigns you through a team."
- [ ] My teams: "You are not on a team yet…", and "No manager is assigned to you yet."
- [ ] My hours: Log hours says there is nothing to log on.

---

## 5. Full lifecycle across roles

One project from creation to close, using the Test Tester account and QAS-001 from section 2.
Keep `mgr001` in one window and Test Tester in another.

**Manager sets up the team**

- [ ] `mgr001` → My team → **Create team**: "QA crew", members: Test Tester (found in the picker as
      unassigned), assigned project QAS-001 → toast "Team QA crew created".
- [ ] Test Tester now appears in Direct reports. QAS-001 no longer shows "No team assigned".

**Manager plans the work**

- [ ] QAS-001 → milestone 01 Build → **Add task**: "Write test plan", assign Test Tester, 4 h, due within Build's dates.
- [ ] Milestone 02 Sign-off → **Add task**: "Sign-off review", Test Tester, 2 h.

**Employee does the work**

- [ ] Sign in as Test Tester (the username from 2.4, password `Tester123!`).
- [ ] Overview: 1 assigned project (QAS-001), "Write test plan" listed, "Sign-off review" Blocked.
- [ ] My teams: QA crew with Morgan Lee as manager.
- [ ] Start "Write test plan" → log 3 h → post a milestone note → **Submit for approval**.

**Manager reviews**

- [ ] `mgr001` Overview with QAS-001 in focus: Pending approvals counts it, and it's in Ready for review.
- [ ] **Request changes**. As Test Tester, the task is In progress again. Log 1 h more and resubmit.
- [ ] `mgr001` → **Approve completion**.
- [ ] Milestone 01 → **Approve milestone completion** is now enabled → click it: toast
      "Milestone approved. The next one is unlocked." 01 shows Completed and 02 is no longer Locked.
- [ ] As Test Tester, "Sign-off review" is now Assigned and can be started. Start it, log 1 h, submit.
- [ ] `mgr001` approves the task, then approves milestone 02.
- [ ] The project panel now offers **Close project** → **Confirm close**: toast "Project QAS-001 closed".
      Its status shows Closed, and the edit and milestone buttons are gone.

**After the close**

- [ ] As Test Tester, every entry in My hours on QAS-001 is View only.
- [ ] `mgr001` → My team → Test Tester → **Release from your reports** works now (no open tasks).
- [ ] `adm001` → Audit activity → filter by actor Test Tester: there is an event for each thing
      they did (start, hours, note, submit). Filter by actor Morgan Lee: the team, milestones,
      tasks, the request for changes, the approvals and the close are all there.
      **View change** on one of them shows before / after.
- [ ] `adm001` → People & access → Test Tester → **Archive account** → confirm. Test Tester can't sign in.
- [ ] `adm001` → Archives → restore Test Tester. They can sign in again and still see their history in My hours.

---

## 6. Final sweep

- [ ] Leave a tab open for more than 8 hours, or delete `localStorage` in dev tools, then click
      anything: you're sent to the login page, with no crash.
- [ ] No errors in the browser console on any page you visited.
- [ ] Every page has a sensible empty state when there is nothing to show (seen in 4.5 and 3.6).
- [ ] Bugs found: list them below with the step number.

| Step | What happened | What should happen |
|------|---------------|--------------------|
|      |               |                    |
