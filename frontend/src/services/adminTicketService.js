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
