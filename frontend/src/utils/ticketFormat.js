/**
 * Display labels and formatting for ticket fields. Codes match the API (schemas.py).
 * Dot colors are for small status markers next to text, never for text itself.
 */

export const STATUSES = {
  open: { label: 'Open', dot: '#056DAE' },
  // Sky blue is too light for text, but fine for a dot that sits next to its label.
  in_progress: { label: 'In Progress', dot: '#00BDF2' },
  blocked: { label: 'Blocked', dot: '#E65100' },
  resolved: { label: 'Resolved', dot: '#2E7D32' },
  closed: { label: 'Closed', dot: '#757575' },
}

/**
 * Internal triage priority, set from the impact. Staff screens only: employee pages
 * must never render it. `chip` is the MUI Chip color and variant; the text always
 * says P1/P2/P3, so the meaning never rests on color alone.
 */
export const PRIORITIES = {
  P1: { label: 'P1', description: 'Building-wide', chip: { color: 'error', variant: 'filled' } },
  P2: { label: 'P2', description: 'A whole floor', chip: { color: 'warning', variant: 'outlined' } },
  P3: { label: 'P3', description: 'One person', chip: { color: 'default', variant: 'outlined' } },
}

/** Impact: who the issue affects (the API's affected_scope). */
export const SCOPES = {
  me: 'Just me',
  floor: 'My floor',
  building: 'Building',
}

export const CATEGORIES = {
  network: 'Network / Internet',
  hardware: 'Computer / Hardware',
  printer: 'Printer / Peripheral',
  hvac: 'HVAC / Temperature',
  electrical: 'Electrical / Power',
  furniture: 'Furniture / Workspace',
  building_facilities: 'Building Facilities',
  other: 'Other',
}

export const ROLES = {
  employee: 'Employee',
  engineer: 'Engineer',
  admin: 'Facility admin',
}

/**
 * "Building A · Floor 3 · Seat 301", using only the levels the ticket has.
 * @param {{building_name: string, floor_number?: number|null, seat_number?: string|null}} ticket
 */
export function formatLocation({ building_name, floor_number, seat_number }) {
  return [
    building_name,
    floor_number != null && `Floor ${floor_number}`,
    seat_number && `Seat ${seat_number}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

const dateTime = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/**
 * Short date and time in the viewer's time zone, e.g. "Sep 22, 8:35 PM".
 * @param {string} iso
 */
export function formatDateTime(iso) {
  return dateTime.format(new Date(iso))
}

/**
 * How long ago something happened, in its largest whole unit: "just now", "12 min",
 * "3 h", "2 d". For "waiting 3 h" on the admin's triage queue.
 * @param {string} iso
 * @param {number} [now] epoch ms, for tests
 */
export function formatAge(iso, now = Date.now()) {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min`
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h`
  return `${Math.floor(minutes / (24 * 60))} d`
}

/**
 * An engineer with their load, for choosing who to assign: "Sam Tech · 2 active, 1 P1".
 * @param {{full_name: string, active_count: number, p1_count: number}} engineer
 */
export function formatEngineerLoad({ full_name: name, active_count: active, p1_count: p1 }) {
  return `${name} · ${active} active${p1 ? `, ${p1} P1` : ''}`
}
