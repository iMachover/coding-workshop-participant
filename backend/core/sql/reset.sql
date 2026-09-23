-- LOCAL DEV ONLY: deletes every table and all data. Re-run schema.sql and seed.sql afterwards.
-- Refuses to run unless connected to a local server (Unix socket or loopback), so it can't
-- wipe Aurora. The DROP sits inside the same block, so the refusal always stops it,
-- even if psql is run without ON_ERROR_STOP.

DO $$
DECLARE
    server_addr INET := inet_server_addr();  -- NULL over a Unix socket
BEGIN
    IF server_addr IS NOT NULL AND NOT (server_addr << '127.0.0.0/8' OR server_addr = '::1') THEN
        RAISE EXCEPTION 'reset.sql is local-dev only; refusing to run against %', server_addr;
    END IF;

    DROP TABLE IF EXISTS ticket_status_history, ticket_notes, tickets, seats, floors, buildings, users CASCADE;
END
$$;
