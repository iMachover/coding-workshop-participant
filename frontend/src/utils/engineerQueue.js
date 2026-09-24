/**
 * Picks from an engineer's active queue for their dashboard. Pure, so it's easy to
 * test; the tickets come from GET /engineer/tickets?view=active, already in triage order.
 */

/**
 * The ticket to show first: what they're working on now (the most recently updated
 * In Progress ticket), or else what to pick up next (their top Open ticket, since the
 * list is P1 first then oldest). Blocked tickets wait on someone else, so they're never
 * picked. Null when there's nothing to work on.
 * @param {object[]} tickets active tickets in the API's triage order
 * @returns {{ticket: object, kind: 'current'|'next'} | null}
 */
export function pickCurrentTicket(tickets) {
  const inProgress = tickets
    .filter((t) => t.status === 'in_progress')
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
  if (inProgress.length > 0) return { ticket: inProgress[0], kind: 'current' }
  const next = tickets.find((t) => t.status === 'open')
  return next ? { ticket: next, kind: 'next' } : null
}
