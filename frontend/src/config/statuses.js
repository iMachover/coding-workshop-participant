/**
 * Labels and colours for every status the API returns.
 * Display states (blocked, queued) and health are derived by the API; see EMPLOYEE.md §2.
 */

/** Badge colours from the prototype's `.acme-badge` variants. */
export const TONES = {
  success: { bg: '#edf2e8', fg: '#406147' },
  warning: { bg: '#faf0d9', fg: '#88601c' },
  info: { bg: '#e7eff0', fg: '#2b6570' },
  neutral: { bg: '#edf0eb', fg: '#4d5d58' },
  muted: { bg: '#edf0eb', fg: '#6f7a75' },
  danger: { bg: '#f6e9e2', fg: '#9c503c' },
};

export const TASK_STATUS = {
  in_progress: { label: 'In progress', tone: 'info' },
  assigned: { label: 'Assigned', tone: 'neutral' },
  submitted: { label: 'Completion requested', tone: 'warning' },
  completed: { label: 'Completed', tone: 'success' },
  blocked: { label: 'Blocked', tone: 'muted' },
  queued: { label: 'Queued', tone: 'muted' },
};

export const HEALTH = {
  on_track: { label: 'On track', tone: 'success' },
  at_risk: { label: 'At risk', tone: 'warning' },
};

export const MILESTONE_STATUS = {
  completed: { label: 'Completed', tone: 'success' },
  in_progress: { label: 'In progress', tone: 'info' },
  not_started: { label: 'Not started', tone: 'neutral' },
  locked: { label: 'Locked', tone: 'muted' },
};

export const ROLE = {
  admin: { label: 'Admin', tone: 'info' },
  manager: { label: 'Manager', tone: 'info' },
  employee: { label: 'Employee', tone: 'neutral' },
  archived: { label: 'Archived', tone: 'muted' },
};

/** Shown on a project until its manager links a team to it (My team page). */
export const NO_TEAM = { none: { label: 'No team assigned', tone: 'warning' } };

export const AUDIT_ACTION = {
  created: 'Created',
  updated: 'Updated',
  archived: 'Archived',
  restored: 'Restored',
  assigned: 'Assigned',
  submitted: 'Submitted',
  completed: 'Completed',
  reopened: 'Reopened',
  approved: 'Approved',
  closed: 'Closed',
  logged_hours: 'Logged hours',
  noted: 'Added note',
};
