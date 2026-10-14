-- 002: every table the employee, manager and admin flows need, beyond users.
-- Columns from EMPLOYEE.md §5, with the additions and final audit_log shape from ADMIN.md §5.
-- Records are archived, not deleted: foreign keys block deletes, except the two join tables,
-- whose rows go with their team or project.

CREATE TYPE project_status   AS ENUM ('active', 'closed');
CREATE TYPE milestone_status AS ENUM ('not_started', 'in_progress', 'completed');
CREATE TYPE task_status      AS ENUM ('assigned', 'in_progress', 'submitted', 'completed');

-- Project codes are PREFIX-### per department (INF-025); the app increments next_project_seq.
CREATE TABLE departments (
    id               BIGSERIAL PRIMARY KEY,
    department_name  TEXT    NOT NULL UNIQUE,
    prefix           CHAR(3) NOT NULL UNIQUE CHECK (prefix ~ '^[A-Z]{3}$'),
    next_project_seq INT     NOT NULL DEFAULT 1 CHECK (next_project_seq >= 1)
);

ALTER TABLE users ADD COLUMN department_id BIGINT REFERENCES departments(id);
CREATE INDEX users_department_id_idx ON users (department_id);
CREATE INDEX users_active_role_idx ON users (role) WHERE is_archived = FALSE;

CREATE TABLE projects (
    id            BIGSERIAL PRIMARY KEY,
    code          VARCHAR(12)    NOT NULL UNIQUE,
    name          TEXT           NOT NULL,
    description   TEXT,
    department_id BIGINT         NOT NULL REFERENCES departments(id),
    manager_id    BIGINT         NOT NULL REFERENCES users(id),
    start_date    DATE           NOT NULL,
    end_date      DATE           NOT NULL,
    budget        NUMERIC(12,2)  NOT NULL DEFAULT 0 CHECK (budget >= 0),
    status        project_status NOT NULL DEFAULT 'active',
    is_archived   BOOLEAN        NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ    NOT NULL DEFAULT now(),
    CHECK (start_date <= end_date)
);

CREATE INDEX projects_department_id_idx ON projects (department_id);
CREATE INDEX projects_manager_id_idx ON projects (manager_id);

-- A team belongs to one manager; members must be that manager's direct reports (checked in the API).
CREATE TABLE teams (
    id         BIGSERIAL PRIMARY KEY,
    name       TEXT        NOT NULL,
    manager_id BIGINT      NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX teams_manager_id_idx ON teams (manager_id);

CREATE TABLE team_members (
    team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (team_id, user_id)
);

CREATE INDEX team_members_user_id_idx ON team_members (user_id);

-- "Which projects am I on" = users -> team_members -> project_teams -> projects.
CREATE TABLE project_teams (
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    team_id    BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, team_id)
);

CREATE INDEX project_teams_team_id_idx ON project_teams (team_id);

CREATE TABLE milestones (
    id                 BIGSERIAL PRIMARY KEY,
    project_id         BIGINT           NOT NULL REFERENCES projects(id),
    name               TEXT             NOT NULL,
    description        TEXT,
    sequence           INT              NOT NULL CHECK (sequence >= 1),
    start_date         DATE,
    projected_end_date DATE,
    predicted_hours    NUMERIC(8,2)     NOT NULL DEFAULT 0 CHECK (predicted_hours >= 0),
    status             milestone_status NOT NULL DEFAULT 'not_started',
    completed_at       TIMESTAMPTZ,
    created_at         TIMESTAMPTZ      NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ      NOT NULL DEFAULT now(),
    UNIQUE (project_id, sequence)
);

CREATE INDEX milestones_project_id_idx ON milestones (project_id);

-- Task codes are TSK-### from this global sequence; the app formats the number.
CREATE SEQUENCE task_code_seq;

CREATE TABLE tasks (
    id              BIGSERIAL PRIMARY KEY,
    code            VARCHAR(12)  NOT NULL UNIQUE,
    milestone_id    BIGINT       NOT NULL REFERENCES milestones(id),
    assigned_to     BIGINT       NOT NULL REFERENCES users(id),
    title           TEXT         NOT NULL,
    description     TEXT,
    predicted_hours NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (predicted_hours >= 0),
    due_date        DATE,
    status          task_status  NOT NULL DEFAULT 'assigned',
    started_at      TIMESTAMPTZ,
    submitted_at    TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX tasks_assigned_to_idx ON tasks (assigned_to);
CREATE INDEX tasks_milestone_id_idx ON tasks (milestone_id);

CREATE TABLE task_resources (
    id             BIGSERIAL PRIMARY KEY,
    task_id        BIGINT        NOT NULL REFERENCES tasks(id),
    name           TEXT          NOT NULL,
    quantity       INT           NOT NULL DEFAULT 1 CHECK (quantity > 0),
    estimated_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (estimated_cost >= 0),
    actual_cost    NUMERIC(12,2) CHECK (actual_cost >= 0)
);

CREATE INDEX task_resources_task_id_idx ON task_resources (task_id);

CREATE TABLE time_entries (
    id         BIGSERIAL PRIMARY KEY,
    task_id    BIGINT       NOT NULL REFERENCES tasks(id),
    user_id    BIGINT       NOT NULL REFERENCES users(id),
    work_date  DATE         NOT NULL,
    hours      NUMERIC(5,2) NOT NULL CHECK (hours > 0),
    note       TEXT,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX time_entries_user_id_work_date_idx ON time_entries (user_id, work_date);
CREATE INDEX time_entries_task_id_idx ON time_entries (task_id);

CREATE TABLE milestone_notes (
    id           BIGSERIAL PRIMARY KEY,
    milestone_id BIGINT      NOT NULL REFERENCES milestones(id),
    user_id      BIGINT      NOT NULL REFERENCES users(id),
    note_text    TEXT        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX milestone_notes_milestone_id_idx ON milestone_notes (milestone_id);

-- Append-only. entity_id points at whichever table entity_type names, so it has no foreign key.
CREATE TABLE audit_log (
    id            BIGSERIAL PRIMARY KEY,
    actor_user_id BIGINT      NOT NULL REFERENCES users(id),
    action        TEXT        NOT NULL,
    entity_type   TEXT        NOT NULL,
    entity_id     BIGINT      NOT NULL,
    entity_code   TEXT,
    summary       TEXT        NOT NULL,
    details       JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_created_at_idx ON audit_log (created_at DESC);
CREATE INDEX audit_log_actor_user_id_idx ON audit_log (actor_user_id);
CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id);
