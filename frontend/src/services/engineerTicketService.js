import { api } from './apiClient'

/**
 * Engineer routes (/engineer/tickets): the caller's own queue. Engineers only; any ticket
 * not assigned to the caller is a 404. Loaders take (params, {signal}) for useApiData.
 */

/**
 * The tickets assigned to the caller, P1 first, then the longest-waiting. Empty values
 * are ignored.
 * @param {{view?: 'active'|'closed', status?: string, priority?: string,
 *   building_id?: number|string, q?: string}} [filters]
 * @param {{signal?: AbortSignal}} [options]
 */
export function listMyQueue(filters = {}, { signal } = {}) {
  return api.get('/engineer/tickets', { params: filters, signal })
}

/**
 * One of the caller's tickets, with priority and the requester's contact details.
 * @param {{ticketId: number|string}} params
 * @param {{signal?: AbortSignal}} [options]
 */
export function getAssignedTicket({ ticketId }, { signal } = {}) {
  return api.get(`/engineer/tickets/${Number(ticketId)}`, { signal })
}

/** Every status one of the caller's tickets has been in, oldest first. */
export function listAssignedTicketHistory({ ticketId }, { signal } = {}) {
  return api.get(`/engineer/tickets/${Number(ticketId)}/history`, { signal })
}

/** Every note on one of the caller's tickets, oldest first. */
export function listAssignedTicketNotes({ ticketId }, { signal } = {}) {
  return api.get(`/engineer/tickets/${Number(ticketId)}/notes`, { signal })
}

/** Add a note to one of the caller's tickets. Rejects with 409 if it's closed. */
export function addAssignedTicketNote(ticketId, noteText) {
  return api.post(`/engineer/tickets/${Number(ticketId)}/notes`, { note_text: noteText.trim() })
}

/**
 * Move one of the caller's tickets along the workflow. Resolves with the updated ticket.
 * A blank reason is left out (it's required for blocked and resolved; the API says so
 * with a 422). Rejects with 409 for a move the workflow doesn't allow.
 * @param {number|string} ticketId
 * @param {'in_progress'|'blocked'|'resolved'} status
 * @param {string} [reason]
 */
export function changeTicketStatus(ticketId, status, reason = '') {
  const body = { status }
  if (reason.trim()) body.reason = reason.trim()
  return api.post(`/engineer/tickets/${Number(ticketId)}/status`, body)
}
