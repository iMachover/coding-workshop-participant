# Postman Testing Guide

Manual API testing for the `core` service (Facilities Helpdesk API) in Postman.

> **Keep this file and [postman_collection.json](postman_collection.json) current.** Every time an API route is added or changed, update its section here with the method, URL, headers/auth, params, request body, expected response and common errors, and add or update its request (with tests) in the collection. Routes are defined in [backend/core/routers/](backend/core/routers/).

## Contents

- [Setup](#setup)
- [Conventions](#conventions)
- [Health](#health): `GET /health`, `GET /health/db`
- [Auth](#auth): `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- [Locations](#locations): `GET /buildings`, `GET /buildings/{id}/floors`, `GET /floors/{id}/seats`
- [Tickets](#tickets): list, create, get, status history, notes (list/add), escalation
- [Suggested test run](#suggested-test-run)

---

## Setup

### 1. Start the backend

```sh
cd backend/core && ../.venv/bin/uvicorn function:app --reload --port 8000
```

### 2. Import the collection

In Postman: **Import** → choose [postman_collection.json](postman_collection.json). You get one folder per section below (Health, Auth, Locations, Tickets) with **37 requests**: every route's success case plus its common errors. Each request has tests.

**Run it all:** right-click the collection → **Run collection** → **Run**. Requests run top to bottom, and each one saves what the next ones need into collection variables:

| Variable | Set by | Used for |
|---|---|---|
| `baseUrl` | You (default `http://localhost:8000/api/core`) | Every URL |
| `email`, `otherEmail` | Register pre-request scripts (unique per run) | Register/Login |
| `accessToken` | Login | The `Authorization: Bearer` header (collection-level auth) |
| `otherAccessToken` | "Login - second user" | Checking you can't read another user's ticket |
| `userId` | Register, then Login | Checking `/auth/me` and the ticket's creator |
| `buildingId`, `floorId`, `seatId` | The three location lists | Create ticket |
| `ticketId` | Create ticket | Get / notes / escalation |
| `password`, `missingId` | Fixed | Login; ids that don't exist (`2147483647`) |

A new user and ticket are created on each run, so it can be re-run without resetting the database. To send a single request by hand, run **Auth → Register** and **Login** first so `accessToken` is set. The token lasts 1 hour; after that, protected requests return 401 until you run **Login** again.

**Against AWS:** change the collection variable `baseUrl` to `https://<cloudfront-domain>/api/core` (the `VITE_API_URL` in `frontend/.env.local` + `/api/core`). If you use a Postman environment, only put `baseUrl` in it: an environment variable named `accessToken` or `ticketId` would override the ones the scripts save.

**From the command line** (same tests, no Postman app needed):

```sh
npx newman run postman_collection.json
npx newman run postman_collection.json --env-var baseUrl=https://<cloudfront-domain>/api/core
```

Every URL below is written as `{{baseUrl}}/...`.

---

## Conventions

### Authentication

Every route except health, register and login needs the access token from [Login](#login):

```
Authorization: Bearer {{accessToken}}
```

The collection sends it automatically: its **Authorization** tab is type *Bearer Token*, token `{{accessToken}}`. Requests that need something different (health, register, login, the 401 checks, the other-user check) override it on their own Authorization tab.

On every request the server verifies the token's signature and expiry, then reloads the user from the database. So a deleted account, or a role changed since sign-in, stops the token working at once. The old dev-only `X-User-Id` header is gone: sending it does nothing.

Routes also check the caller's **role**. `/tickets` is for employees; engineers and admins get 403 there. `/auth/me` and the location lists work for every signed-in role.

### Request bodies

POST requests send JSON: **Body → raw → JSON**, which sets `Content-Type: application/json`.

### Error shapes

Business errors (400, 401, 403, 404, 409) return a single message:

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
| 401 | No `Authorization` header, or it isn't `Bearer <token>` (protected routes) | `{"detail":"Please sign in to continue."}` |
| 401 | Token malformed, tampered with, or signed with another secret | `{"detail":"Invalid token. Please sign in again."}` |
| 401 | Token older than 1 hour | `{"detail":"Your session has expired. Please sign in again."}` |
| 401 | The token's user was deleted | `{"detail":"Unknown user"}` |
| 401 | The user's role changed since sign-in | `{"detail":"Your access has changed. Please sign in again."}` |
| 403 | Valid token, but the role may not use this route | `{"detail":"You don't have access to this."}` |
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

**Expected response: `200 OK`.** A signed access token (JWT, HS256) plus the same user object as Register. The collection saves `access_token` into `{{accessToken}}` and `user.user_id` into `{{userId}}`. **Login - second user** does the same for the second user, into `{{otherAccessToken}}`.

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwicm9sZSI6ImVtcGxveWVlIiwi...",
  "token_type": "bearer",
  "expires_in": 3600,
  "user": {
    "user_id": 1,
    "email": "jane.doe@acme.inc",
    "full_name": "Jane Doe",
    "phone_number": "555-0101",
    "role": "employee",
    "created_at": "2026-09-22T20:21:06.105106-04:00"
  }
}
```

| Field | Meaning |
|---|---|
| `access_token` | Send it as `Authorization: Bearer <token>`. It is signed with the user id and role from the database at login. |
| `token_type` | Always `bearer` |
| `expires_in` | Seconds until the token expires (1 hour). After that, sign in again. |

The token's payload holds only `sub` (user id), `role`, `iat` (issued at), `exp` (expires at) and `iss` (`facilities-helpdesk`): no password, email or name. Paste a token into [jwt.io](https://jwt.io) to see its claims. It's signed, not encrypted, so anyone can read it but nobody can change it without the secret.

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
| **Auth** | `Authorization: Bearer {{accessToken}}` |

**Expected response: `200 OK`.** Same user object as Login, read fresh from the database. Works for every role.

**Errors:** 401 only, for each reason in [Errors any route can return](#errors-any-route-can-return). The collection checks four of them: no token, the old `X-User-Id` header on its own, a value that isn't a JWT, and a real token whose payload was edited to say `admin` (the signature no longer matches). Expiry, a deleted user and a changed role need the server's secret or the database, so they're covered by `backend/core/tests/test_auth.py` instead.

---

## Locations

These feed the Building → Floor → Seat dropdowns. All of them need a token; any signed-in role may call them.

### List buildings

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `{{baseUrl}}/buildings` |
| **Auth** | `Authorization: Bearer {{accessToken}}` |

**Expected response: `200 OK`**

```json
[
  { "building_id": 1, "building_name": "Building A" },
  { "building_id": 2, "building_name": "Building B" }
]
```

**Errors:** 401 (see [above](#errors-any-route-can-return)).

### List floors in a building

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `{{baseUrl}}/buildings/:building_id/floors` |
| **Auth** | `Authorization: Bearer {{accessToken}}` |
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
| 401 | Missing, invalid or expired token | see [above](#errors-any-route-can-return) |
| 404 | Building doesn't exist | `{"detail":"Building not found"}` |
| 422 | `building_id` not a positive integer | `loc: ["path","building_id"]` |

### List seats on a floor

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `{{baseUrl}}/floors/:floor_id/seats` |
| **Auth** | `Authorization: Bearer {{accessToken}}` |
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
| 401 | Missing, invalid or expired token | see [above](#errors-any-route-can-return) |
| 404 | Floor doesn't exist | `{"detail":"Floor not found"}` |
| 422 | `floor_id` not a positive integer | `loc: ["path","floor_id"]` |

---

## Tickets

Every ticket route acts on behalf of the token's user and is **employee-only**: engineers and admins get `403 {"detail":"You don't have access to this."}` (their own routes come later). Employees only ever see **their own** tickets: someone else's ticket returns **404, not 403**, so its existence isn't revealed. The server stores an internal `priority` (P1–P3) for engineers and admins, and it never appears in these responses.

### List my tickets

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `{{baseUrl}}/tickets` |
| **Auth** | `Authorization: Bearer {{accessToken}}` |

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
| 401 | Missing, invalid or expired token | see [above](#errors-any-route-can-return) |
| 403 | Signed in as an engineer or admin | `{"detail":"You don't have access to this."}` |
| 422 | Unknown value (e.g. `status=done`) | FastAPI validation list |
| 422 | Unknown parameter, **including `priority`** | `type: "extra_forbidden"`, `loc: ["query","priority"]` |

### Create a ticket

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `{{baseUrl}}/tickets` |
| **Auth** | `Authorization: Bearer {{accessToken}}` |
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

The server sets `status` (`open`), the creator (from the token) and the internal priority (building → P1, floor → P2, me → P3). Sending `status`, `priority` or `created_by_user_id` in the body has no effect.

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
| 401 | Missing, invalid or expired token | see [above](#errors-any-route-can-return) |
| 403 | Signed in as an engineer or admin | `{"detail":"You don't have access to this."}` |

### Get one of my tickets

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `{{baseUrl}}/tickets/:ticket_id` |
| **Auth** | `Authorization: Bearer {{accessToken}}` |
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
| 401 | Missing, invalid or expired token | see [above](#errors-any-route-can-return) |
| 403 | Signed in as an engineer or admin | `{"detail":"You don't have access to this."}` |

### List status history

Every status the ticket has been in, **oldest first**, and who changed it. The first row is the ticket's creation (`from_status: null`). A reopened ticket shows it as its own step, e.g. `resolved` → `open`, with the reason if one was given.

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `{{baseUrl}}/tickets/:ticket_id/history` |
| **Auth** | `Authorization: Bearer {{accessToken}}` |
| **Path params** | `ticket_id`: positive integer |

**Expected response: `200 OK`.**

```json
[
  {
    "history_id": 7,
    "ticket_id": 1,
    "from_status": null,
    "to_status": "open",
    "changed_by_user_id": 1,
    "changed_by_name": "Jane Doe",
    "changed_by_role": "employee",
    "reason": null,
    "changed_at": "2026-09-22T20:35:34.471658-04:00"
  }
]
```

| Field | Notes |
|---|---|
| `from_status` | `null` only on the creation row; otherwise a [status](#enum-values) |
| `to_status` | The status the ticket moved to |
| `changed_by_*` | Who made the change: the employee at creation, an engineer or admin after that |
| `reason` | Optional, e.g. why it was blocked or reopened |

Nothing in the API changes status yet (engineer/admin endpoints come later), so a new ticket has exactly one row.

**Errors:** same as [Get one of my tickets](#get-one-of-my-tickets) (404 / 422 / 401 / 403).

### List notes on a ticket

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `{{baseUrl}}/tickets/:ticket_id/notes` |
| **Auth** | `Authorization: Bearer {{accessToken}}` |
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

**Errors:** same as [Get one of my tickets](#get-one-of-my-tickets) (404 / 422 / 401 / 403).

### Add a note to a ticket

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `{{baseUrl}}/tickets/:ticket_id/notes` |
| **Auth** | `Authorization: Bearer {{accessToken}}` |
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
| 401 | Missing, invalid or expired token | see [above](#errors-any-route-can-return) |
| 403 | Signed in as an engineer or admin | `{"detail":"You don't have access to this."}` |

### Request escalation

Asks a Facility Admin to review the ticket. Allowed **once per ticket**.

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `{{baseUrl}}/tickets/:ticket_id/escalation` |
| **Auth** | `Authorization: Bearer {{accessToken}}` |
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
| 401 | Missing, invalid or expired token | see [above](#errors-any-route-can-return) |
| 403 | Signed in as an engineer or admin | `{"detail":"You don't have access to this."}` |

---

## Suggested test run

**Run collection** does all of this (and a few more error cases) automatically. The table is the short version, if you'd rather click through by hand. Run the steps in order; each builds on the one before.

| # | Request | Expect |
|---|---|---|
| 1 | `GET /health/db` | 200 |
| 2 | `POST /auth/register` with a new `@acme.inc` email | 201 |
| 3 | Same register again | 409 |
| 4 | `POST /auth/login` with a wrong password | 401 |
| 5 | `POST /auth/login` with the right password (sets `{{accessToken}}`) | 200, `token_type: "bearer"` |
| 6 | `GET /auth/me` with no token, then with `Bearer not-a-jwt` | 401, 401 |
| 7 | `GET /buildings` → `/buildings/1/floors` → `/floors/3/seats` | 200 ×3 |
| 8 | `POST /tickets` with scope `floor` and no `floor_id` | 422 |
| 9 | `POST /tickets` with a seat from a different floor | 400 |
| 10 | `POST /tickets` valid (sets `{{ticketId}}`) | 201, `status: "open"`, no `priority` |
| 11 | `GET /tickets?view=active` | 200, includes the new ticket |
| 12 | `GET /tickets?priority=P1` | 422 |
| 13 | `GET /tickets/{{ticketId}}` with another user's token (register and log in a second user first) | 404 |
| 14 | `GET /tickets/{{ticketId}}/history` | 200, one row: `from_status: null`, `to_status: "open"` |
| 15 | `POST /tickets/{{ticketId}}/notes` | 201 |
| 16 | `POST /tickets/{{ticketId}}/escalation` | 200, `escalation_requested: true` |
| 17 | Same escalation again | 409 |
