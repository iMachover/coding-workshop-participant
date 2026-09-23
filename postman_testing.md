# Postman Testing Guide

Manual API testing for the `core` service (Facilities Helpdesk API) in Postman.

> **Keep this file and [postman_collection.json](postman_collection.json) current.** Every time an API route is added or changed, update its section here with the method, URL, headers/auth, params, request body, expected response and common errors, and add or update its request (with tests) in the collection. Routes are defined in [backend/core/routers/](backend/core/routers/).

## Contents

- [Setup](#setup)
- [Conventions](#conventions)
- [Health](#health): `GET /health`, `GET /health/db`
- [Auth](#auth): `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- [Locations](#locations): `GET /buildings`, `GET /buildings/{id}/floors`, `GET /floors/{id}/seats`
- [Tickets](#tickets): list, create, get, notes (list/add), escalation
- [Suggested test run](#suggested-test-run)

---

## Setup

### 1. Start the backend

```sh
cd backend/core && ../.venv/bin/uvicorn function:app --reload --port 8000
```

### 2. Import the collection

In Postman: **Import** → choose [postman_collection.json](postman_collection.json). You get one folder per section below (Health, Auth, Locations, Tickets) with **32 requests**: every route's success case plus its common errors. Each request has tests.

**Run it all:** right-click the collection → **Run collection** → **Run**. Requests run top to bottom, and each one saves what the next ones need into collection variables:

| Variable | Set by | Used for |
|---|---|---|
| `baseUrl` | You (default `http://localhost:8000/api/core`) | Every URL |
| `email`, `otherEmail` | Register pre-request scripts (unique per run) | Register/Login |
| `userId` | Register, then Login | The `X-User-Id` header (collection-level auth) |
| `otherUserId` | "Register - second user" | Checking you can't read another user's ticket |
| `buildingId`, `floorId`, `seatId` | The three location lists | Create ticket |
| `ticketId` | Create ticket | Get / notes / escalation |
| `password`, `missingId` | Fixed | Login; ids that don't exist (`2147483647`) |

A new user and ticket are created on each run, so it can be re-run without resetting the database. To send a single request by hand, run **Auth → Register** and **Login** first so `userId` is set.

**Against AWS:** change the collection variable `baseUrl` to `https://<cloudfront-domain>/api/core` (the `VITE_API_URL` in `frontend/.env.local` + `/api/core`). If you use a Postman environment, only put `baseUrl` in it: an environment variable named `userId` or `ticketId` would override the ones the scripts save.

**From the command line** (same tests, no Postman app needed):

```sh
npx newman run postman_collection.json
npx newman run postman_collection.json --env-var baseUrl=https://<cloudfront-domain>/api/core
```

Every URL below is written as `{{baseUrl}}/...`.

---

## Conventions

### Authentication (temporary, dev-only)

There are no tokens yet. After login, send the returned `user_id` in a header:

```
X-User-Id: {{userId}}
```

The collection sends it automatically: its **Authorization** tab is type *API Key*, key `X-User-Id`, value `{{userId}}`, added to the header. Requests that need something different (health, register, login, the 401 checks, the other-user check) override it on their own Authorization tab. Only the health, register and login routes work without it.

> ⚠️ This header is a **development shortcut**: anyone can claim any id. It will be replaced by JWT (`Authorization: Bearer <token>`). When that happens, update this section and every **Headers** row below.

### Request bodies

POST requests send JSON: **Body → raw → JSON**, which sets `Content-Type: application/json`.

### Error shapes

Business errors (400, 401, 404, 409) return a single message:

```json
{ "detail": "Ticket not found" }
```

Validation errors (422) come from FastAPI and list every problem, with `loc` saying where it is (`body`, `query` or `path`):

```json
{
  "detail": [
    {
      "type": "string_too_short",
      "loc": ["body", "password"],
      "msg": "String should have at least 8 characters",
      "input": "short",
      "ctx": { "min_length": 8 }
    }
  ]
}
```

### Errors any route can return

| Status | When | Body |
|---|---|---|
| 401 | `X-User-Id` missing, not a number, or out of range (protected routes) | `{"detail":"Missing or invalid X-User-Id header"}` |
| 401 | `X-User-Id` is a number but no such user exists | `{"detail":"Unknown user"}` |
| 404 | Route doesn't exist | `{"detail":"Not Found"}` |
| 405 | Wrong HTTP method for the path | `{"detail":"Method Not Allowed"}` |
| 422 | Path id is not a positive integer (e.g. `/tickets/abc`, `/tickets/0`) | FastAPI validation list |
| 500 | Unexpected server error. Details are logged, never returned | `{"detail":"Internal server error"}` |

### Enum values

| Field | Allowed values |
|---|---|
| `category` | `network`, `hardware`, `printer`, `hvac`, `electrical`, `furniture`, `building_facilities`, `other` |
| `urgency` | `low`, `medium`, `high` |
| `affected_scope` | `me`, `floor`, `building` |
| `status` | `open`, `in_progress`, `blocked`, `resolved`, `closed` |
| `role` | `employee`, `engineer`, `admin` |

---

## Health

### Health check

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `{{baseUrl}}/health` |
| **Auth** | None |

**Expected response: `200 OK`**

```json
{ "status": "ok" }
```

### Database health check

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `{{baseUrl}}/health/db` |
| **Auth** | None |

**Expected response: `200 OK`**

```json
{ "status": "ok", "db": "ok" }
```

**Errors**

| Status | When | Body |
|---|---|---|
| 503 | Postgres is down or unreachable. It recovers on its own once Postgres is back | `{"status":"error","db":"unavailable"}` |

---

## Auth

### Register

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `{{baseUrl}}/auth/register` |
| **Auth** | None |
| **Headers** | `Content-Type: application/json` |

**Body**

| Field | Type | Required | Rules |
|---|---|---|---|
| `email` | string | yes | Must be `@acme.inc`, max 254. Trimmed and lowercased |
| `full_name` | string | yes | 1–100 chars after trimming |
| `phone_number` | string | no | 1–30 chars after trimming |
| `password` | string | yes | 8–128 chars |

```json
{
  "email": "jane.doe@acme.inc",
  "full_name": "Jane Doe",
  "phone_number": "555-0101",
  "password": "hunter2hunter2"
}
```

**Expected response: `201 Created`.** The role is always `employee`. The password hash is never returned.

```json
{
  "user_id": 1,
  "email": "jane.doe@acme.inc",
  "full_name": "Jane Doe",
  "phone_number": "555-0101",
  "role": "employee",
  "created_at": "2026-09-22T20:21:06.105106-04:00"
}
```

**Errors**

| Status | When | Body |
|---|---|---|
| 409 | Email already registered (case-insensitive) | `{"detail":"An account with this email already exists"}` |
| 422 | Non-`@acme.inc` email | `msg: "Value error, Email must be an @acme.inc address"` |
| 422 | Password under 8 chars, blank `full_name`, missing field | FastAPI validation list |

### Login

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `{{baseUrl}}/auth/login` |
| **Auth** | None |
| **Headers** | `Content-Type: application/json` |

**Body**

| Field | Type | Required | Rules |
|---|---|---|---|
| `email` | string | yes | Max 254. Case-insensitive |
| `password` | string | yes | Max 128 |

```json
{ "email": "jane.doe@acme.inc", "password": "hunter2hunter2" }
```

**Expected response: `200 OK`.** This is the same user object as Register. Save `user_id` into `{{userId}}`.

```json
{
  "user_id": 1,
  "email": "jane.doe@acme.inc",
  "full_name": "Jane Doe",
  "phone_number": "555-0101",
  "role": "employee",
  "created_at": "2026-09-22T20:21:06.105106-04:00"
}
```

**Errors**

| Status | When | Body |
|---|---|---|
| 401 | Wrong email **or** wrong password. The message is the same on purpose, so it doesn't reveal which emails exist | `{"detail":"Invalid email or password"}` |
| 422 | Missing `email` or `password` | FastAPI validation list |

### Current user

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `{{baseUrl}}/auth/me` |
| **Auth** | `X-User-Id: {{userId}}` |

**Expected response: `200 OK`.** Same user object as Login.

**Errors:** 401 only (see [Errors any route can return](#errors-any-route-can-return)).

---

## Locations

These feed the Building → Floor → Seat dropdowns. All of them need `X-User-Id`.

### List buildings

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `{{baseUrl}}/buildings` |
| **Auth** | `X-User-Id: {{userId}}` |

**Expected response: `200 OK`**

```json
[
  { "building_id": 1, "building_name": "Building A" },
  { "building_id": 2, "building_name": "Building B" }
]
```

**Errors:** 401.

### List floors in a building

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `{{baseUrl}}/buildings/:building_id/floors` |
| **Auth** | `X-User-Id: {{userId}}` |
| **Path params** | `building_id`: positive integer |

**Expected response: `200 OK`**

```json
[
  { "floor_id": 1, "floor_number": 1, "building_id": 1 },
  { "floor_id": 2, "floor_number": 2, "building_id": 1 },
  { "floor_id": 3, "floor_number": 3, "building_id": 1 }
]
```

**Errors**

| Status | When | Body |
|---|---|---|
| 401 | Missing/unknown user | see above |
| 404 | Building doesn't exist | `{"detail":"Building not found"}` |
| 422 | `building_id` not a positive integer | `loc: ["path","building_id"]` |

### List seats on a floor

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `{{baseUrl}}/floors/:floor_id/seats` |
| **Auth** | `X-User-Id: {{userId}}` |
| **Path params** | `floor_id`: positive integer |

**Expected response: `200 OK`**

```json
[
  { "seat_id": 3, "seat_number": "301", "floor_id": 3 },
  { "seat_id": 8, "seat_number": "302", "floor_id": 3 }
]
```

Seat ids aren't sequential within a floor. Always take them from this response.

**Errors**

| Status | When | Body |
|---|---|---|
| 401 | Missing/unknown user | see above |
| 404 | Floor doesn't exist | `{"detail":"Floor not found"}` |
| 422 | `floor_id` not a positive integer | `loc: ["path","floor_id"]` |

---

## Tickets

Every ticket route acts on behalf of the `X-User-Id` caller. Employees only ever see **their own** tickets: someone else's ticket returns **404, not 403**, so its existence isn't revealed. The server stores an internal `priority` (P1–P3) for engineers and admins, and it never appears in these responses.

### List my tickets

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `{{baseUrl}}/tickets` |
| **Auth** | `X-User-Id: {{userId}}` |

**Query params** (all optional, combined with AND)

| Param | Values | Notes |
|---|---|---|
| `view` | `active`, `closed` | `active` = everything not closed (resolved tickets still show) |
| `status` | `open`, `in_progress`, `blocked`, `resolved`, `closed` | |
| `urgency` | `low`, `medium`, `high` | |
| `q` | text, max 100 | Case-insensitive match on title or short description, or an exact ticket id |

Examples: `{{baseUrl}}/tickets?view=active&urgency=high`, `{{baseUrl}}/tickets?q=printer`

**Expected response: `200 OK`.** Sorted by most recently updated first. Returns `[]` when nothing matches.

```json
[
  {
    "ticket_id": 1,
    "title": "Wi-Fi keeps dropping",
    "short_description": "Disconnects every few minutes",
    "category": "network",
    "status": "in_progress",
    "urgency": "medium",
    "affected_scope": "me",
    "escalation_requested": false,
    "building_id": 1,
    "building_name": "Building A",
    "floor_id": 3,
    "floor_number": 3,
    "seat_id": 3,
    "seat_number": "301",
    "created_at": "2026-09-22T20:35:34.471658-04:00",
    "updated_at": "2026-09-22T22:16:17.499763-04:00"
  }
]
```

**Errors**

| Status | When | Body |
|---|---|---|
| 401 | Missing/unknown user | see above |
| 422 | Unknown value (e.g. `status=done`) | FastAPI validation list |
| 422 | Unknown parameter, **including `priority`** | `type: "extra_forbidden"`, `loc: ["query","priority"]` |

### Create a ticket

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `{{baseUrl}}/tickets` |
| **Auth** | `X-User-Id: {{userId}}` |
| **Headers** | `Content-Type: application/json` |

**Body**

| Field | Type | Required | Rules |
|---|---|---|---|
| `title` | string | yes | 1–150 chars after trimming |
| `short_description` | string | yes | 1–280 chars after trimming |
| `description` | string | yes | 1–5000 chars after trimming |
| `category` | enum | yes | See [Enum values](#enum-values) |
| `urgency` | enum | yes | `low`, `medium`, `high` |
| `affected_scope` | enum | yes | `me`, `floor`, `building` |
| `building_id` | integer | yes | Must exist |
| `floor_id` | integer | if scope is `floor` or `me` | Must be in `building_id` |
| `seat_id` | integer | if scope is `me` | Must be on `floor_id`. Needs `floor_id` |

The server sets `status` (`open`), the creator (from `X-User-Id`) and the internal priority (building → P1, floor → P2, me → P3). Sending `status`, `priority` or `created_by_user_id` in the body has no effect.

```json
{
  "title": "Wi-Fi keeps dropping",
  "short_description": "Disconnects every few minutes",
  "description": "Since this morning my laptop loses Wi-Fi every 5-10 minutes.",
  "category": "network",
  "urgency": "medium",
  "affected_scope": "me",
  "building_id": 1,
  "floor_id": 3,
  "seat_id": 3
}
```

**Expected response: `201 Created`**

```json
{
  "ticket_id": 12,
  "title": "Wi-Fi keeps dropping",
  "short_description": "Disconnects every few minutes",
  "description": "Since this morning my laptop loses Wi-Fi every 5-10 minutes.",
  "category": "network",
  "urgency": "medium",
  "affected_scope": "me",
  "status": "open",
  "building_id": 1,
  "floor_id": 3,
  "seat_id": 3,
  "created_by_user_id": 1,
  "assigned_to_user_id": null,
  "escalation_requested": false,
  "escalation_reason": null,
  "blocked_reason": null,
  "created_at": "2026-09-22T23:10:00.000000-04:00",
  "updated_at": "2026-09-22T23:10:00.000000-04:00",
  "acknowledged_at": null,
  "assigned_at": null,
  "resolved_at": null
}
```

**Errors**

| Status | When | Body |
|---|---|---|
| 400 | Building doesn't exist | `{"detail":"Building 999 does not exist"}` |
| 400 | Floor doesn't exist / isn't in the building | `{"detail":"Floor 7 does not exist"}` / `{"detail":"Floor 4 is not in building 1"}` |
| 400 | Seat doesn't exist / isn't on the floor | `{"detail":"Seat 50 does not exist"}` / `{"detail":"Seat 1 is not on floor 3"}` |
| 422 | `affected_scope: "floor"` without `floor_id` | `msg: "Value error, Floor-wide issues need a floor_id"` |
| 422 | `affected_scope: "me"` without `seat_id` | `msg: "Value error, Issues affecting only you need a floor_id and seat_id"` |
| 422 | `seat_id` without `floor_id` | `msg: "Value error, A seat_id requires a floor_id"` |
| 422 | Blank/too-long text, unknown enum value, missing field | FastAPI validation list |
| 401 | Missing/unknown user | see above |

### Get one of my tickets

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `{{baseUrl}}/tickets/:ticket_id` |
| **Auth** | `X-User-Id: {{userId}}` |
| **Path params** | `ticket_id`: positive integer |

**Expected response: `200 OK`.** This is the full ticket plus location names and the assignee's name.

```json
{
  "ticket_id": 1,
  "title": "Wi-Fi keeps dropping",
  "short_description": "Disconnects every few minutes",
  "description": "Since this morning my laptop loses Wi-Fi every 5-10 minutes.",
  "category": "network",
  "urgency": "medium",
  "affected_scope": "me",
  "status": "in_progress",
  "building_id": 1,
  "floor_id": 3,
  "seat_id": 3,
  "created_by_user_id": 1,
  "assigned_to_user_id": 4,
  "escalation_requested": false,
  "escalation_reason": null,
  "blocked_reason": null,
  "created_at": "2026-09-22T20:35:34.471658-04:00",
  "updated_at": "2026-09-22T22:16:17.499763-04:00",
  "acknowledged_at": "2026-09-22T20:43:21.447302-04:00",
  "assigned_at": "2026-09-22T20:43:21.447302-04:00",
  "resolved_at": null,
  "building_name": "Building A",
  "floor_number": 3,
  "seat_number": "301",
  "assigned_to_name": "Sam Tech"
}
```

**Errors**

| Status | When | Body |
|---|---|---|
| 404 | Ticket doesn't exist, **or belongs to another user** | `{"detail":"Ticket not found"}` |
| 422 | `ticket_id` not a positive integer | `loc: ["path","ticket_id"]` |
| 401 | Missing/unknown user | see above |

### List notes on a ticket

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `{{baseUrl}}/tickets/:ticket_id/notes` |
| **Auth** | `X-User-Id: {{userId}}` |
| **Path params** | `ticket_id`: positive integer |

**Expected response: `200 OK`.** Oldest first, with the author's name and role.

```json
[
  {
    "note_id": 2,
    "ticket_id": 1,
    "user_id": 4,
    "author_name": "Sam Tech",
    "author_role": "engineer",
    "note_text": "Replacing the Wi-Fi card on your dock this afternoon.",
    "created_at": "2026-09-22T20:45:04.272815-04:00"
  },
  {
    "note_id": 3,
    "ticket_id": 1,
    "user_id": 1,
    "author_name": "Jane Doe",
    "author_role": "employee",
    "note_text": "Thanks, I will be at my desk after 2pm.",
    "created_at": "2026-09-22T20:45:04.289678-04:00"
  }
]
```

**Errors:** same as [Get one of my tickets](#get-one-of-my-tickets) (404 / 422 / 401).

### Add a note to a ticket

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `{{baseUrl}}/tickets/:ticket_id/notes` |
| **Auth** | `X-User-Id: {{userId}}` |
| **Headers** | `Content-Type: application/json` |
| **Path params** | `ticket_id`: positive integer |

**Body**

| Field | Type | Required | Rules |
|---|---|---|---|
| `note_text` | string | yes | 1–2000 chars after trimming |

```json
{ "note_text": "Thanks, I will be at my desk after 2pm." }
```

**Expected response: `201 Created`.** The ticket's `updated_at` is bumped too.

```json
{
  "note_id": 3,
  "ticket_id": 1,
  "user_id": 1,
  "author_name": "Jane Doe",
  "author_role": "employee",
  "note_text": "Thanks, I will be at my desk after 2pm.",
  "created_at": "2026-09-22T20:45:04.289678-04:00"
}
```

**Errors**

| Status | When | Body |
|---|---|---|
| 404 | Ticket doesn't exist or isn't yours | `{"detail":"Ticket not found"}` |
| 409 | Ticket is closed | `{"detail":"Closed tickets can't take new notes"}` |
| 422 | Blank or whitespace-only `note_text`, or over 2000 chars | `loc: ["body","note_text"]` |
| 401 | Missing/unknown user | see above |

### Request escalation

Asks a Facility Admin to review the ticket. Allowed **once per ticket**.

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `{{baseUrl}}/tickets/:ticket_id/escalation` |
| **Auth** | `X-User-Id: {{userId}}` |
| **Headers** | `Content-Type: application/json` |
| **Path params** | `ticket_id`: positive integer |

**Body**

| Field | Type | Required | Rules |
|---|---|---|---|
| `reason` | string | yes | 1–1000 chars after trimming |

```json
{ "reason": "Still dropping after 3 days, I can't join calls." }
```

**Expected response: `200 OK`.** Returns the updated ticket, in the same shape as [Get one of my tickets](#get-one-of-my-tickets), with:

```json
{
  "escalation_requested": true,
  "escalation_reason": "Still dropping after 3 days, I can't join calls."
}
```

**Errors**

| Status | When | Body |
|---|---|---|
| 404 | Ticket doesn't exist or isn't yours | `{"detail":"Ticket not found"}` |
| 409 | Ticket is closed | `{"detail":"Closed tickets can't be escalated"}` |
| 409 | Already escalated | `{"detail":"Escalation has already been requested for this ticket"}` |
| 422 | Blank `reason` or over 1000 chars | `loc: ["body","reason"]` |
| 401 | Missing/unknown user | see above |

---

## Suggested test run

**Run collection** does all of this (and a few more error cases) automatically. The table is the short version, if you'd rather click through by hand. Run the steps in order; each builds on the one before.

| # | Request | Expect |
|---|---|---|
| 1 | `GET /health/db` | 200 |
| 2 | `POST /auth/register` with a new `@acme.inc` email | 201 |
| 3 | Same register again | 409 |
| 4 | `POST /auth/login` with a wrong password | 401 |
| 5 | `POST /auth/login` with the right password (sets `{{userId}}`) | 200 |
| 6 | `GET /auth/me` without `X-User-Id` | 401 |
| 7 | `GET /buildings` → `/buildings/1/floors` → `/floors/3/seats` | 200 ×3 |
| 8 | `POST /tickets` with scope `floor` and no `floor_id` | 422 |
| 9 | `POST /tickets` with a seat from a different floor | 400 |
| 10 | `POST /tickets` valid (sets `{{ticketId}}`) | 201, `status: "open"`, no `priority` |
| 11 | `GET /tickets?view=active` | 200, includes the new ticket |
| 12 | `GET /tickets?priority=P1` | 422 |
| 13 | `GET /tickets/{{ticketId}}` with another user's `X-User-Id` | 404 |
| 14 | `POST /tickets/{{ticketId}}/notes` | 201 |
| 15 | `POST /tickets/{{ticketId}}/escalation` | 200, `escalation_requested: true` |
| 16 | Same escalation again | 409 |
