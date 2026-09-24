import { describe, expect, it } from 'vitest'

import { pickCurrentTicket } from './engineerQueue'

const t = (ticket_id, status, extra = {}) => ({
  ticket_id,
  status,
  priority: 'P3',
  updated_at: '2026-09-23T10:00:00Z',
  ...extra,
})

describe('pickCurrentTicket', () => {
  it('prefers the most recently updated ticket in progress', () => {
    const tickets = [
      t(1, 'open', { priority: 'P1' }),
      t(2, 'in_progress', { updated_at: '2026-09-23T09:00:00Z' }),
      t(3, 'in_progress', { updated_at: '2026-09-23T11:00:00Z' }),
    ]
    expect(pickCurrentTicket(tickets)).toEqual({ ticket: tickets[2], kind: 'current' })
  })

  it('otherwise suggests the top open ticket, in the API\'s triage order', () => {
    const tickets = [t(4, 'blocked', { priority: 'P1' }), t(5, 'open', { priority: 'P1' }), t(6, 'open')]
    expect(pickCurrentTicket(tickets)).toEqual({ ticket: tickets[1], kind: 'next' })
  })

  it.each([
    ['nothing', []],
    ['only blocked and resolved', [t(7, 'blocked'), t(8, 'resolved')]],
  ])('is null with %s', (_label, tickets) => {
    expect(pickCurrentTicket(tickets)).toBeNull()
  })
})
