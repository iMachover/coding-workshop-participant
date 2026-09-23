import { describe, expect, it, vi } from 'vitest'

import { api } from './apiClient'
import {
  assignTicket,
  getTicket,
  listAllTickets,
  listTicketHistory,
  listTicketNotes,
} from './adminTicketService'

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

  it('assigns with a numeric engineer id', async () => {
    const put = vi.spyOn(api, 'put').mockResolvedValue({ ticket_id: 7 })

    await expect(assignTicket('7', '4')).resolves.toEqual({ ticket_id: 7 })

    expect(put).toHaveBeenCalledWith('/admin/tickets/7/assignment', { engineer_id: 4 })
  })
})
