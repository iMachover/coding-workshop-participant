import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../App'
import { ApiError } from '../services/apiClient'
import {
  addAssignedTicketNote,
  getAssignedTicket,
  listAssignedTicketHistory,
  listAssignedTicketNotes,
  listMyQueue,
} from '../services/engineerTicketService'
import { listBuildings } from '../services/locationService'
import { QUEUE } from '../test/fixtures'
import { renderWithProviders, SAM } from '../test/renderWithProviders'

vi.mock('../services/engineerTicketService', () => ({
  getAssignedTicket: vi.fn(),
  listAssignedTicketHistory: vi.fn(),
  listAssignedTicketNotes: vi.fn(),
  addAssignedTicketNote: vi.fn(),
  listMyQueue: vi.fn(),
}))
vi.mock('../services/locationService', () => ({ listBuildings: vi.fn() }))

// GET /engineer/tickets/9: Sam's escalated Wi-Fi ticket, in progress.
const TICKET = {
  ...QUEUE[2],
  description: 'My laptop loses Wi-Fi every 5-10 minutes.',
  escalation_reason: 'I have client calls all afternoon.',
  blocked_reason: null,
  acknowledged_at: '2026-09-22T10:05:00-04:00',
  assigned_at: '2026-09-22T10:05:00-04:00',
  resolved_at: null,
  created_by_email: 'jane@acme.inc',
  created_by_phone: '555-0100',
}

const NOTES = [
  { note_id: 1, ticket_id: 9, user_id: 1, author_name: 'Jane Doe', author_role: 'employee', note_text: 'Still dropping.', created_at: '2026-09-22T11:10:00-04:00' },
]
const SAMS_NOTE = { note_id: 2, ticket_id: 9, user_id: SAM.user_id, author_name: 'Sam Tech', author_role: 'engineer', note_text: 'Swapping the access point.', created_at: '2026-09-22T11:20:00-04:00' }

const HISTORY = [
  { history_id: 1, ticket_id: 9, from_status: null, to_status: 'open', changed_by_user_id: 1, changed_by_name: 'Jane Doe', changed_by_role: 'employee', reason: null, changed_at: '2026-09-22T10:00:00-04:00' },
]

function renderPage(route = '/engineer/tickets/9', width = 1280) {
  const user = userEvent.setup()
  renderWithProviders(<App />, { route, user: SAM, width })
  return user
}

const panel = (name) => screen.getByRole('region', { name })
const heading = () => screen.findByRole('heading', { level: 1, name: '#9 Wi-Fi keeps dropping' })

beforeEach(() => {
  vi.mocked(getAssignedTicket).mockReset().mockResolvedValue(TICKET)
  vi.mocked(listAssignedTicketHistory).mockReset().mockResolvedValue(HISTORY)
  vi.mocked(listAssignedTicketNotes).mockReset().mockResolvedValue(NOTES)
  vi.mocked(addAssignedTicketNote).mockReset()
  vi.mocked(listMyQueue).mockReset().mockResolvedValue(QUEUE)
  vi.mocked(listBuildings).mockReset().mockResolvedValue([])
})

describe('EngineerTicketDetailsPage: loading and errors', () => {
  it('shows a placeholder while loading', () => {
    vi.mocked(getAssignedTicket).mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByLabelText('Loading ticket')).toHaveAttribute('aria-busy', 'true')
  })

  it.each(['/engineer/tickets/abc', '/engineer/tickets/0'])('treats %s as not found without calling the API', (route) => {
    renderPage(route)
    expect(screen.getByRole('heading', { level: 1, name: 'Ticket not found' })).toBeInTheDocument()
    expect(getAssignedTicket).not.toHaveBeenCalled()
  })

  it('shows a ticket that isn\'t mine as not found, with a way back', async () => {
    vi.mocked(getAssignedTicket).mockRejectedValue(new ApiError('Ticket not found', { status: 404 }))
    renderPage('/engineer/tickets/77')
    expect(await screen.findByRole('heading', { level: 1, name: 'Ticket not found' })).toBeInTheDocument()
    expect(screen.getByText(/it may have been reassigned/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to my queue' })).toHaveAttribute('href', '/engineer')
  })

  it('explains other failures and retries', async () => {
    vi.mocked(getAssignedTicket)
      .mockRejectedValueOnce(new ApiError('Something went wrong on our side. Please try again.', { status: 500 }))
      .mockResolvedValue(TICKET)
    const user = renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on our side.')
    expect(screen.getByRole('link', { name: 'Back to my queue' })).toHaveAttribute('href', '/engineer')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await heading()).toBeInTheDocument()
  })
})

describe('EngineerTicketDetailsPage: the ticket', () => {
  it('opens from the queue', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/engineer', user: SAM })
    const table = await screen.findByRole('table', { name: 'My tickets' })

    await user.click(within(table).getByRole('link', { name: 'Wi-Fi keeps dropping' }))

    expect(await heading()).toBeInTheDocument()
    expect(getAssignedTicket).toHaveBeenCalledWith({ ticketId: '9' }, expect.anything())
  })

  it('shows priority, the escalation, the details and how to reach the requester', async () => {
    renderPage()
    await heading()

    expect(screen.getByLabelText('Priority P3: One person')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Jane Doe asked for an admin to review this ticket')
    expect(within(panel('Progress')).getByRole('list', { name: 'Ticket workflow' })).toBeInTheDocument()
    expect(within(panel('Details')).getByText('My laptop loses Wi-Fi every 5-10 minutes.')).toBeInTheDocument()
    expect(within(panel('Details')).getByText('Sam Tech')).toBeInTheDocument()
    const requester = panel('Requester')
    expect(within(requester).getByRole('link', { name: 'jane@acme.inc' })).toHaveAttribute('href', 'mailto:jane@acme.inc')
    expect(within(requester).getByRole('link', { name: '555-0100' })).toHaveAttribute('href', 'tel:5550100')
    expect(await within(panel('Status history')).findByText(/Jane Doe/)).toBeInTheDocument()
    expect(listAssignedTicketHistory).toHaveBeenCalledWith({ ticketId: '9' }, expect.anything())
  })

  it('works on a phone', async () => {
    renderPage('/engineer/tickets/9', 375)
    await heading()
    expect(screen.getByRole('list', { name: 'Ticket workflow' })).toHaveStyle({ flexDirection: 'column' })
  })
})

describe('EngineerTicketDetailsPage: notes', () => {
  it('adds a note for the requester and refreshes the ticket', async () => {
    vi.mocked(addAssignedTicketNote).mockResolvedValue(SAMS_NOTE)
    const user = renderPage()
    await heading()
    const notes = panel('Notes')
    expect(await within(notes).findByText('Still dropping.')).toBeInTheDocument()
    vi.mocked(listAssignedTicketNotes).mockResolvedValue([...NOTES, SAMS_NOTE])

    const box = within(notes).getByRole('textbox', { name: 'Add a note' })
    expect(box).toHaveAttribute('placeholder', "Tell the requester what you've found or what happens next.")
    await user.type(box, 'Swapping the access point.')
    await user.click(within(notes).getByRole('button', { name: 'Add note' }))

    expect(addAssignedTicketNote).toHaveBeenCalledWith(9, 'Swapping the access point.')
    expect(await within(notes).findByText('Swapping the access point.')).toBeInTheDocument()
    expect(within(notes).getByText('You')).toBeInTheDocument()
    expect(box).toHaveValue('')
    expect(getAssignedTicket).toHaveBeenCalledTimes(2)
  })

  it('shows why a note was refused', async () => {
    vi.mocked(addAssignedTicketNote).mockRejectedValue(new ApiError("Closed tickets can't take new notes", { status: 409 }))
    const user = renderPage()
    await heading()

    await user.type(within(panel('Notes')).getByRole('textbox', { name: 'Add a note' }), 'Done.')
    await user.click(within(panel('Notes')).getByRole('button', { name: 'Add note' }))

    expect(await within(panel('Notes')).findByText("Closed tickets can't take new notes")).toBeInTheDocument()
  })

  it('takes no notes on a closed ticket', async () => {
    vi.mocked(getAssignedTicket).mockResolvedValue({ ...TICKET, status: 'closed' })
    renderPage()
    await heading()
    expect(within(panel('Notes')).getByText("This ticket is closed, so new notes can't be added.")).toBeInTheDocument()
    expect(within(panel('Notes')).queryByRole('textbox')).not.toBeInTheDocument()
  })
})
