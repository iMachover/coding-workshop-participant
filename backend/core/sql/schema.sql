-- Employee-slice tables for the Facilities Helpdesk.
-- Safe to re-run: every statement uses IF NOT EXISTS. Use reset.sql to start over.

CREATE TABLE IF NOT EXISTS users (
    user_id       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
    full_name     TEXT NOT NULL,
    phone_number  TEXT,
    role          TEXT NOT NULL DEFAULT 'employee'
                  CHECK (role IN ('employee', 'engineer', 'admin')),
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS buildings (
    building_id   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    building_name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS floors (
    floor_id     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    floor_number INTEGER NOT NULL,
    building_id  INTEGER NOT NULL REFERENCES buildings (building_id),
    UNIQUE (building_id, floor_number)
);

CREATE TABLE IF NOT EXISTS seats (
    seat_id     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    seat_number TEXT NOT NULL,
    floor_id    INTEGER NOT NULL REFERENCES floors (floor_id),
    UNIQUE (floor_id, seat_number)
);

CREATE TABLE IF NOT EXISTS tickets (
    ticket_id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title                TEXT NOT NULL,
    short_description    TEXT NOT NULL,
    description          TEXT NOT NULL,
    category             TEXT NOT NULL CHECK (category IN (
                             'network', 'hardware', 'printer', 'hvac',
                             'electrical', 'furniture', 'building_facilities', 'other'
                         )),
    urgency              TEXT NOT NULL CHECK (urgency IN ('low', 'medium', 'high')),
    affected_scope       TEXT NOT NULL CHECK (affected_scope IN ('me', 'floor', 'building')),
    priority             TEXT NOT NULL CHECK (priority IN ('P1', 'P2', 'P3')),
    status               TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
                             'open', 'in_progress', 'blocked', 'resolved', 'closed'
                         )),
    building_id          INTEGER NOT NULL REFERENCES buildings (building_id),
    floor_id             INTEGER REFERENCES floors (floor_id),
    seat_id              INTEGER REFERENCES seats (seat_id),
    created_by_user_id   INTEGER NOT NULL REFERENCES users (user_id),
    assigned_to_user_id  INTEGER REFERENCES users (user_id),
    escalation_requested BOOLEAN NOT NULL DEFAULT false,
    escalation_reason    TEXT,
    blocked_reason       TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    acknowledged_at      TIMESTAMPTZ,
    assigned_at          TIMESTAMPTZ,
    resolved_at          TIMESTAMPTZ,
    -- A seat only makes sense inside a floor. That the floor belongs to the building
    -- and the seat to the floor is checked in ticket_service before insert.
    CHECK (seat_id IS NULL OR floor_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON tickets (created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets (assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (status);

CREATE TABLE IF NOT EXISTS ticket_notes (
    note_id    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ticket_id  INTEGER NOT NULL REFERENCES tickets (ticket_id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users (user_id),
    note_text  TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_notes_ticket ON ticket_notes (ticket_id);
