import { describe, expect, it } from 'vitest'

import { METRIC_CARDS, selectedMetric } from './adminMetrics'

const DEFAULTS = { view: 'active', q: '', status: '', priority: '', assignment: '', escalated: false }

describe('METRIC_CARDS', () => {
  it('has a card for every count the API returns, in order', () => {
    expect(METRIC_CARDS.map((c) => c.key)).toEqual([
      'unassigned',
      'open',
      'in_progress',
      'blocked',
      'resolved',
      'active_p1',
      'escalated',
      'closed_last_7_days',
    ])
  })
})

describe('selectedMetric', () => {
  it.each(METRIC_CARDS.map((c) => [c.key, c.filters]))('recognises the %s card\'s filters', (key, preset) => {
    expect(selectedMetric({ ...DEFAULTS, ...preset }, DEFAULTS)).toBe(key)
  })

  it.each([
    ['the defaults', DEFAULTS],
    ['a card plus a search', { ...DEFAULTS, status: 'open', q: 'lamp' }],
    ['a card on the wrong view', { ...DEFAULTS, status: 'open', view: 'all' }],
  ])('is null for %s', (_label, filters) => {
    expect(selectedMetric(filters, DEFAULTS)).toBeNull()
  })
})
