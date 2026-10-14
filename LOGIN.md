# Logins

Development accounts created by the seed (`backend/api/app/db/seed.py`). They are added automatically
the first time the API starts against an empty database, so every environment (your Mac, the workshop
VM, LocalStack, AWS) has the same accounts.

> These passwords are public in this repo. Change or remove these accounts before anyone outside the
> team can reach the app.

## Accounts

| Username | Password | Role | Name | Job title | Department | Reports to |
|----------|----------|------|------|-----------|------------|------------|
| `adm001` | `Admin123!` | admin | Ada Admin | System Administrator | none | none |
| `mgr001` | `Manager123!` | manager | Morgan Lee | Infrastructure Manager | Infrastructure (INF) | none |
| `mgr002` | `Manager123!` | manager | Taylor Brooks | Operations Manager | Operations (OPS) | none |
| `emp001` | `Employee123!` | employee | Sam Rivera | Systems Engineer | Infrastructure (INF) | `mgr001` |
| `emp002` | `Employee123!` | employee | Priya Natarajan | Network Engineer | Infrastructure (INF) | `mgr001` |
| `emp003` | `Employee123!` | employee | Jordan Okafor | Datacenter Technician | Infrastructure (INF) | `mgr001` |
| `emp004` | `Employee123!` | employee | Casey Nguyen | Inventory Analyst | Operations (OPS) | `mgr002` |
| `emp005` | `Employee123!` | employee | Alex Kim | Storage Engineer | Infrastructure (INF) | nobody yet |

## Which account to use

| To check | Log in as | Seeded data they have |
|----------|-----------|-----------------------|
| Admin pages (Overview, Projects, People & access, Audit activity, Archives, Settings) | `adm001` | Sees every project and user, plus 9 sample audit entries |
| A manager with a busy project | `mgr001` | Manages INF-024 "Legacy server retirement" (3 milestones) and team "Server Ops" |
| A second manager, to test that managers only see their own projects | `mgr002` | Manages OPS-018 "Asset inventory alignment" (2 milestones) and team "Asset Control" |
| An employee with work in progress and recent hours | `emp001` | A task in progress on INF-024, hours logged on each of the last 5 weekdays, a milestone note |
| An employee with work waiting for review | `emp002` | A submitted task on INF-024 |
| An employee with nothing started yet | `emp003` | Only assigned tasks: one in the current milestone, one Blocked in the next |
| An employee on the other manager's project | `emp004` | A task in progress on OPS-018 |
| An employee no manager has taken on yet (pick them from My team → Assign employee) | `emp005` | No teams, projects or tasks |

## How login works

- Sign in at the app's `/login` page with a username and password. There is no self-registration;
  admins create accounts on the People & access page. The username is generated there (6 letters
  or digits) and shown once, together with the temporary password the admin typed.
- Usernames are exactly 6 characters. A wrong username, a wrong password and an archived account all
  get the same "invalid username or password" message.
- A successful login returns a JWT that lasts 8 hours. The browser keeps it in `localStorage` and
  sends it with every API request. When it expires, the next request returns 401 and the app goes
  back to the login page.
- Log out with the button next to your name at the bottom of the sidebar.
- An archived account cannot sign in. Admins archive and restore accounts from a person's profile.
- What you see depends on your role: the sidebar lists only your role's pages, and opening another
  role's page by URL shows a "no access" page. The API checks the role again on every request.

## Logging in from the command line

```sh
# Local API (uvicorn on port 8000)
curl -s -X POST localhost:8000/auth/login -H 'Content-Type: application/json' \
     -d '{"username":"emp001","password":"Employee123!"}'

# Through the local proxy or CloudFront, add the /api/api prefix
curl -s -X POST localhost:3001/api/api/auth/login -H 'Content-Type: application/json' \
     -d '{"username":"emp001","password":"Employee123!"}'
```

Send the returned `token` as `Authorization: Bearer <token>`, for example to `GET /me`.
