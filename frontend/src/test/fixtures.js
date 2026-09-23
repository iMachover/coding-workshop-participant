/** Ticket list items shaped like GET /api/core/tickets responses (which never include priority). */

export function makeTicket(overrides = {}) {
  return {
    ticket_id: 1,
    title: 'Wi-Fi keeps dropping',
    short_description: 'Disconnects every few minutes',
    category: 'network',
    status: 'open',
    urgency: 'medium',
    affected_scope: 'me',
    escalation_requested: false,
    building_id: 1,
    building_name: 'Building A',
    floor_id: 3,
    floor_number: 3,
    seat_id: 3,
    seat_number: '301',
    created_at: '2026-09-22T10:00:00-04:00',
    updated_at: '2026-09-22T10:00:00-04:00',
    ...overrides,
  }
}

/** Newest update first, as the API returns them. */
export const TICKETS = [
  makeTicket({
    ticket_id: 5,
    title: 'Printer jam',
    short_description: 'Tray 2 stuck',
    category: 'printer',
    status: 'in_progress',
    urgency: 'high',
    affected_scope: 'floor',
    floor_number: 2,
    seat_id: null,
    seat_number: null,
    updated_at: '2026-09-22T12:00:00-04:00',
  }),
  makeTicket({ ticket_id: 2, title: 'Old lamp', status: 'closed', updated_at: '2026-09-22T11:30:00-04:00' }),
  makeTicket({
    ticket_id: 4,
    title: 'Lobby doors',
    status: 'blocked',
    affected_scope: 'building',
    building_name: 'Building B',
    floor_number: null,
    seat_number: null,
    updated_at: '2026-09-22T11:00:00-04:00',
  }),
  makeTicket({ ticket_id: 1, updated_at: '2026-09-22T10:00:00-04:00' }),
]

/** A row shaped like GET /api/core/admin/tickets: the employee row plus triage fields. */
export function makeAdminTicket(overrides = {}) {
  return makeTicket({
    priority: 'P3',
    created_by_user_id: 1,
    created_by_name: 'Jane Doe',
    assigned_to_user_id: null,
    assigned_to_name: null,
    ...overrides,
  })
}

/** Every employee's tickets in the API's triage order: P1 first, then the oldest. */
export const ADMIN_TICKETS = [
  makeAdminTicket({
    ticket_id: 7,
    title: 'Lobby lights out',
    category: 'electrical',
    urgency: 'high',
    affected_scope: 'building',
    priority: 'P1',
    building_id: 2,
    building_name: 'Building B',
    floor_id: null,
    floor_number: null,
    seat_id: null,
    seat_number: null,
    created_by_user_id: 2,
    created_by_name: 'Eve Other',
    created_at: '2026-09-22T09:00:00-04:00',
  }),
  makeAdminTicket({
    ticket_id: 5,
    title: 'Printer jam',
    category: 'printer',
    status: 'in_progress',
    urgency: 'high',
    affected_scope: 'floor',
    priority: 'P2',
    floor_number: 2,
    seat_id: null,
    seat_number: null,
    assigned_to_user_id: 4,
    assigned_to_name: 'Sam Tech',
    created_at: '2026-09-22T08:00:00-04:00',
  }),
  makeAdminTicket({ ticket_id: 1, escalation_requested: true, created_at: '2026-09-22T07:00:00-04:00' }),
  makeAdminTicket({
    ticket_id: 2,
    title: 'Old lamp',
    category: 'electrical',
    status: 'closed',
    assigned_to_user_id: 4,
    assigned_to_name: 'Sam Tech',
    created_at: '2026-09-22T06:00:00-04:00',
  }),
]
