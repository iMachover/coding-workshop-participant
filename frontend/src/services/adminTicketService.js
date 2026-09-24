import { api } from './apiClient'

/**
 * Facility Admin ticket routes (/admin/tickets). Admins only; the API answers 403 for
 * other roles. Each takes (params, {signal}) so it can be used directly with useApiData.
 */

/**
 * Every ticket, P1 first, then the longest-waiting. Empty values are ignored.
 * @param {{view?: 'active'|'closed', status?: string, priority?: string, category?: string,
 *   building_id?: number|string, assignment?: 'unassigned'|'assigned', escalated?: boolean,
 *   q?: string}} [filters]
 * @param {{signal?: AbortSignal}} [options]
 */
export function listAllTickets(filters = {}, { signal } = {}) {
  return api.get('/admin/tickets', { params: filters, signal })
}

/**
 * Any ticket, with its priority and the requester's contact details. Rejects with 404
 * for a ticket that doesn't exist.
 * @param {{ticketId: number|string}} params
 * @param {{signal?: AbortSignal}} [options]
 */
export function getTicket({ ticketId }, { signal } = {}) {
  return api.get(`/admin/tickets/${Number(ticketId)}`, { signal })
}

/** Every note on any ticket, oldest first. Read-only for admins. */
export function listTicketNotes({ ticketId }, { signal } = {}) {
  return api.get(`/admin/tickets/${Number(ticketId)}/notes`, { signal })
}

/** Every status any ticket has been in, oldest first. */
export function listTicketHistory({ ticketId }, { signal } = {}) {
  return api.get(`/admin/tickets/${Number(ticketId)}/history`, { signal })
}

/**
 * Assign or reassign a ticket to an engineer. Resolves with the updated ticket (admin
 * details shape). Rejects with 409 for a resolved/closed ticket or the same engineer,
 * 400 if the user isn't an engineer, 404 for a missing ticket.
 * @param {number|string} ticketId
 * @param {number|string} engineerId
 */
export function assignTicket(ticketId, engineerId) {
  return api.put(`/admin/tickets/${Number(ticketId)}/assignment`, { engineer_id: Number(engineerId) })
}

/**
 * Close a resolved ticket, or send it back to its engineer. Resolves with the updated
 * ticket. A blank reason is left out (it's required to send back; the API says so with a
 * 422). Rejects with 409 unless the ticket is resolved.
 * @param {number|string} ticketId
 * @param {'closed'|'in_progress'} status
 * @param {string} [reason] what's still wrong, or an optional closing note
 */
export function finishTicket(ticketId, status, reason = '') {
  const body = { status }
  if (reason.trim()) body.reason = reason.trim()
  return api.post(`/admin/tickets/${Number(ticketId)}/status`, body)
}

/**
 * The dashboard's headline counts: unassigned, by status, active P1s, escalations and
 * closed tickets. "Active" means not closed, as in listAllTickets.
 * @param {object} [_params] unused; lets useApiData call it like the other loaders
 * @param {{signal?: AbortSignal}} [options]
 */
export function getMetrics(_params = {}, { signal } = {}) {
  return api.get('/admin/metrics', { signal })
}
