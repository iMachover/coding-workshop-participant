import { describe, expect, it, vi } from 'vitest'

import { api } from './apiClient'
import { getTicket, listAllTickets, listTicketHistory, listTicketNotes } from './adminTicketService'

describe('adminTicketService', () => {
  it('lists all tickets with filters as query params and the abort signal', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue([])
    const { signal } = new AbortController()

    await listAllTickets({ assignment: 'unassigned', priority: 'P1', escalated: true }, { signal })
    await listAllTickets()

    expect(get.mock.calls).toEqual([
      ['/admin/tickets', { params: { assignment: 'unassigned', priority: 'P1', escalated: true }, signal }],
      ['/admin/tickets', { params: {}, signal: undefined }],
    ])
  })

  it('reads any ticket, its notes and its status history', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({})
    const { signal } = new AbortController()

    await getTicket({ ticketId: '7' }, { signal })
    await listTicketNotes({ ticketId: 7 }, { signal })
    await listTicketHistory({ ticketId: '7' })

    expect(get.mock.calls).toEqual([
      ['/admin/tickets/7', { signal }],
      ['/admin/tickets/7/notes', { signal }],
      ['/admin/tickets/7/history', { signal: undefined }],
    ])
  })
})
