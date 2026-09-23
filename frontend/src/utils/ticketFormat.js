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

// Employees see urgency and impact, which they chose themselves. Priority is an
// internal triage field for engineers and admins and is never shown to employees.
export const URGENCIES = {
  low: { label: 'Low', dot: '#757575' },
  medium: { label: 'Medium', dot: '#E65100' },
  high: { label: 'High', dot: '#C62828' },
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
