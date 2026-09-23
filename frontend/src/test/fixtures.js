/** Ticket list items shaped like GET /api/core/tickets responses. */

export function makeTicket(overrides = {}) {
  return {
    ticket_id: 1,
    title: 'Wi-Fi keeps dropping',
    short_description: 'Disconnects every few minutes',
    category: 'network',
    status: 'open',
    urgency: 'medium',
    priority: 'P3',
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
    priority: 'P2',
    affected_scope: 'floor',
    floor_number: 2,
    seat_id: null,
    seat_number: null,
    updated_at: '2026-09-22T12:00:00-04:00',
  }),
  makeTicket({ ticket_id: 2, title: 'Old lamp', status: 'closed', priority: 'P3', updated_at: '2026-09-22T11:30:00-04:00' }),
  makeTicket({
    ticket_id: 4,
    title: 'Lobby doors',
    status: 'blocked',
    priority: 'P1',
    affected_scope: 'building',
    building_name: 'Building B',
    floor_number: null,
    seat_number: null,
    updated_at: '2026-09-22T11:00:00-04:00',
  }),
  makeTicket({ ticket_id: 1, updated_at: '2026-09-22T10:00:00-04:00' }),
]
