/**
 * Summaries of an engineer's active queue for their dashboard. Pure, so they're easy to
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

/**
 * Counts for the dashboard tiles: open, in progress and blocked tickets, and the P1s still
 * to finish. Resolved tickets are done from the engineer's side (they wait for an admin to
 * close them), so they aren't in any count.
 * @param {object[]} tickets active tickets
 * @returns {{open: number, inProgress: number, blocked: number, p1: number}}
 */
export function countQueue(tickets) {
  const count = (test) => tickets.filter(test).length
  return {
    open: count((t) => t.status === 'open'),
    inProgress: count((t) => t.status === 'in_progress'),
    blocked: count((t) => t.status === 'blocked'),
    p1: count((t) => t.priority === 'P1' && t.status !== 'resolved'),
  }
}
