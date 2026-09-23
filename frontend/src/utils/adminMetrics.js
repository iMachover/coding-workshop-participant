/**
 * The admin dashboard's metric cards: each count from GET /admin/metrics, its label, and
 * the All-tickets filters that list exactly those tickets. The filters are merged over
 * the dashboard's defaults (view: active), matching how the API counts ("active" = not
 * closed).
 */
export const METRIC_CARDS = [
  { key: 'unassigned', label: 'Unassigned', filters: { assignment: 'unassigned' } },
  { key: 'open', label: 'Open', filters: { status: 'open' } },
  { key: 'in_progress', label: 'In Progress', filters: { status: 'in_progress' } },
  { key: 'blocked', label: 'Blocked', filters: { status: 'blocked' } },
  { key: 'resolved', label: 'Ready to close', filters: { status: 'resolved' } },
  { key: 'active_p1', label: 'Active P1', filters: { priority: 'P1' } },
  { key: 'escalated', label: 'Escalated', filters: { escalated: true } },
  { key: 'closed_last_7_days', label: 'Closed (7 days)', filters: { view: 'closed' } },
]

/**
 * The card whose filters are exactly what's applied now, so it can show as selected.
 * @param {object} filters the dashboard's current filter values
 * @param {object} defaults the dashboard's default filter values
 * @returns {string | null} the card's key, or null when the filters match no card
 */
export function selectedMetric(filters, defaults) {
  const card = METRIC_CARDS.find(({ filters: preset }) => {
    const expected = { ...defaults, ...preset }
    return Object.keys(expected).every((name) => filters[name] === expected[name])
  })
  return card?.key ?? null
}
