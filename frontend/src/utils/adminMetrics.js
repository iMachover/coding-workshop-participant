/**
 * The admin dashboard's metric cards: which count each shows (from GET /admin/metrics),
 * its label and small print, its dot color, and the All-tickets filters that list exactly
 * those tickets. The filters are merged over the dashboard's defaults (view: active),
 * matching how the API counts ("active" = not closed).
 *
 * "Active" has no filters of its own: it is the default view, so choosing it just clears
 * the other filters. Its count is added up here, since the API has no single number for it.
 */
export const METRIC_CARDS = [
  { key: 'active', label: 'Active', sub: 'open tickets', dot: '#056DAE', filters: null },
  { key: 'unassigned', label: 'Unassigned', sub: 'need engineer', dot: '#00BDF2', filters: { assignment: 'unassigned' } },
  { key: 'escalated', label: 'Escalated', sub: 'by requesters', dot: '#B3261E', filters: { escalated: true } },
  { key: 'blocked', label: 'Blocked', sub: 'waiting', dot: '#ED6C02', filters: { status: 'blocked' } },
  { key: 'resolved', label: 'Resolved', sub: 'awaiting close', dot: '#2E7D32', filters: { status: 'resolved' } },
  { key: 'closed', label: 'Closed', sub: 'all time', dot: '#757575', filters: { view: 'closed' } },
]

// Every status the API counts as active (not closed).
const ACTIVE_COUNTS = ['open', 'in_progress', 'blocked', 'resolved']

/**
 * The number a card shows.
 * @param {string} key a METRIC_CARDS key
 * @param {Record<string, number>} metrics the GET /admin/metrics response
 * @returns {number}
 */
export function metricCount(key, metrics) {
  if (key === 'active') return ACTIVE_COUNTS.reduce((sum, name) => sum + metrics[name], 0)
  return metrics[key]
}

/**
 * The card whose filters are exactly what's applied now, so it can show as selected.
 * "Active" never does: it is the plain default view, not a filter.
 * @param {object} filters the dashboard's current filter values
 * @param {object} defaults the dashboard's default filter values
 * @returns {string | null} the card's key, or null when the filters match no card
 */
export function selectedMetric(filters, defaults) {
  const card = METRIC_CARDS.find(({ filters: preset }) => {
    if (!preset) return false
    const expected = { ...defaults, ...preset }
    return Object.keys(expected).every((name) => filters[name] === expected[name])
  })
  return card?.key ?? null
}
