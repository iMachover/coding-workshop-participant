import { api } from './apiClient'

/**
 * The caller's own tickets, most recently updated first.
 * @param {{view?: 'active'|'closed', status?: string, urgency?: string, priority?: string, q?: string}} [filters]
 *   Empty values are ignored. "active" means everything not closed.
 * @param {{signal?: AbortSignal}} [options]
 */
export function listMyTickets(filters = {}, { signal } = {}) {
  return api.get('/tickets', { params: filters, signal })
}

/**
 * Full details of one of the caller's tickets. Rejects with 404 for a ticket that
 * doesn't exist or belongs to someone else.
 * @param {{ticketId: number|string}} params
 * @param {{signal?: AbortSignal}} [options]
 */
export function getMyTicket({ ticketId }, { signal } = {}) {
  return api.get(`/tickets/${Number(ticketId)}`, { signal })
}

/** A ticket's notes, oldest first, with author name and role. */
export function listNotes({ ticketId }, { signal } = {}) {
  return api.get(`/tickets/${Number(ticketId)}/notes`, { signal })
}

/** Add a note. Rejects with 409 if the ticket is closed. */
export function addNote(ticketId, noteText) {
  return api.post(`/tickets/${Number(ticketId)}/notes`, { note_text: noteText.trim() })
}

/** Ask a Facility Admin to review the ticket. Rejects with 409 if already escalated or closed. */
export function requestEscalation(ticketId, reason) {
  return api.post(`/tickets/${Number(ticketId)}/escalation`, { reason: reason.trim() })
}

/**
 * Create a ticket for the caller. The server sets status, priority and owner.
 * Form values arrive as strings; ids become numbers and blank floor/seat are left out.
 * Resolves with the new ticket; rejects with ApiError (400 wrong location, 422 invalid).
 * @param {Record<string, string>} values
 */
export function createTicket(values) {
  const body = {
    title: values.title.trim(),
    short_description: values.short_description.trim(),
    description: values.description.trim(),
    category: values.category,
    urgency: values.urgency,
    affected_scope: values.affected_scope,
    building_id: Number(values.building_id),
  }
  if (values.floor_id) body.floor_id = Number(values.floor_id)
  if (values.seat_id) body.seat_id = Number(values.seat_id)
  return api.post('/tickets', body)
}
