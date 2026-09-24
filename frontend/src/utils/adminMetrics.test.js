import { describe, expect, it } from 'vitest'

import { METRIC_CARDS, metricCount, selectedMetric } from './adminMetrics'

const DEFAULTS = { view: 'active', q: '', status: '', priority: '', assignment: '', escalated: false }

const METRICS = {
  unassigned: 2,
  open: 3,
  in_progress: 4,
  blocked: 1,
  resolved: 2,
  active_p1: 1,
  escalated: 1,
  closed: 5,
}

describe('METRIC_CARDS', () => {
  it('has the six dashboard cards, in order, with no P1 card', () => {
    expect(METRIC_CARDS.map((c) => c.key)).toEqual([
      'active',
      'unassigned',
      'escalated',
      'blocked',
      'resolved',
      'closed',
    ])
  })
})

describe('metricCount', () => {
  it('adds up every not-closed status for Active', () => {
    expect(metricCount('active', METRICS)).toBe(10)
  })

  it.each([
    ['unassigned', 2],
    ['resolved', 2],
    ['closed', 5],
  ])('reads %s straight from the API', (key, count) => {
    expect(metricCount(key, METRICS)).toBe(count)
  })
})

describe('selectedMetric', () => {
  const withFilters = METRIC_CARDS.filter((c) => c.filters)

  it.each(withFilters.map((c) => [c.key, c.filters]))('recognises the %s card\'s filters', (key, preset) => {
    expect(selectedMetric({ ...DEFAULTS, ...preset }, DEFAULTS)).toBe(key)
  })

  it.each([
    ['the defaults (Active is never selected)', DEFAULTS],
    ['a card plus a search', { ...DEFAULTS, status: 'blocked', q: 'lamp' }],
    ['a card on the wrong view', { ...DEFAULTS, status: 'blocked', view: 'all' }],
  ])('is null for %s', (_label, filters) => {
    expect(selectedMetric(filters, DEFAULTS)).toBeNull()
  })
})
