import { describe, expect, it, vi } from 'vitest'

import { api } from './apiClient'
import {
  addAssignedTicketNote,
  getAssignedTicket,
  listAssignedTicketHistory,
  listAssignedTicketNotes,
  listMyQueue,
} from './engineerTicketService'

describe('engineerTicketService', () => {
  it('lists the queue with filters as query params and the abort signal', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue([])
    const { signal } = new AbortController()

    await listMyQueue({ view: 'active', priority: 'P1' }, { signal })
    await listMyQueue()

    expect(get.mock.calls).toEqual([
      ['/engineer/tickets', { params: { view: 'active', priority: 'P1' }, signal }],
      ['/engineer/tickets', { params: {}, signal: undefined }],
    ])
  })

  it('reads a ticket, its history and its notes', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({})
    const { signal } = new AbortController()

    await getAssignedTicket({ ticketId: '7' }, { signal })
    await listAssignedTicketHistory({ ticketId: 7 }, { signal })
    await listAssignedTicketNotes({ ticketId: '7' })

    expect(get.mock.calls).toEqual([
      ['/engineer/tickets/7', { signal }],
      ['/engineer/tickets/7/history', { signal }],
      ['/engineer/tickets/7/notes', { signal: undefined }],
    ])
  })

  it('adds a trimmed note', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ note_id: 1 })

    await addAssignedTicketNote('7', '  On my way.  ')

    expect(post).toHaveBeenCalledWith('/engineer/tickets/7/notes', { note_text: 'On my way.' })
  })
})
