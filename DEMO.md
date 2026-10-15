# Demo script

Admin sets up people and a project, manager plans it, employee does the work, manager approves
and closes it, admin reviews and archives.

## Setup

Three browser sessions (sign-in is per browser):

- Chrome: Admin `adm001` / `Admin123!`
- Chrome incognito: Dana (manager)
- Safari or Firefox: Riley (employee)

| | Riley Chen | Dana Park |
|---|---|---|
| Email | `riley.chen@acme.test` | `dana.park@acme.test` |
| Job title | Network Engineer | Delivery Manager |
| Role | Employee | Manager |
| Department | Infrastructure | Infrastructure |
| Hourly rate | 60 | 90 |
| Password | `Demo1234!` | `Demo1234!` |
| Username | ______ | ______ |

Project: **Office Wi-Fi upgrade**, Infrastructure, manager Dana, today to +1 month, budget 20000.

Rehearse with different emails (emails must be unique) or reseed afterwards.

---

## 1. Admin

1. People & access → **Create user** → Riley → write down username.
2. **Create user** → Dana → write down username.
3. Projects → **New project** → Office Wi-Fi upgrade → **Create project**.

## 2. Manager (Dana)

1. Sign in.
2. My team → **Create team** "Wi-Fi crew" → add Riley → assign to the project.
3. Projects → open project → **Add dependent milestone** "Site survey" (8 h), then "Install and test" (6 h).
4. Milestone 01 → **Add task** "Survey floors 1 to 3", Riley, 6 h.
5. Milestone 02 → **Add task** "Install access points", Riley, 4 h.

## 3. Employee (Riley)

1. Sign in.
2. "Survey floors 1 to 3" → **Start task** → **Log hours** 5 h → **Submit for approval**.

## 4. Manager (Dana)

1. Overview → **Review submission** → **Approve completion**.
2. Milestone 01 → **Approve milestone completion**.

## 5. Milestone 02

1. Riley: "Install access points" → **Start task** → **Log hours** 3 h → **Submit for approval**.
2. Dana: **Review submission** → **Approve completion** → milestone 02 → **Approve milestone completion**.
3. Dana: open project → **Close project** → **Confirm close**.

## 6. Admin

1. Projects → open the project.
2. People & access → **View profile** on Riley.
3. Audit activity → filter by actor → **View change** on a task approval.

## 7. Archive and restore (Admin)

1. Project → **Archive project**.
2. People & access → Riley → **Archive account**.
3. Archives → **Restore record** on both.

---

**Forgot a username:** People & access → profile.
**Nobody in Assign to:** attach Wi-Fi crew to the project (My team → Manage team).
