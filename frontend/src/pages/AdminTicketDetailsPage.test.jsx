import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../App'
import {
  assignTicket,
  getTicket,
  listAllTickets,
  listTicketHistory,
  listTicketNotes,
} from '../services/adminTicketService'
import { listEngineers } from '../services/adminUserService'
import { ApiError } from '../services/apiClient'
import { listBuildings } from '../services/locationService'
import { ADMIN_TICKETS, ENGINEERS, makeAdminTicket } from '../test/fixtures'
import { ALEX, renderWithProviders } from '../test/renderWithProviders'

vi.mock('../services/adminTicketService', () => ({
  getTicket: vi.fn(),
  listTicketNotes: vi.fn(),
  listTicketHistory: vi.fn(),
  listAllTickets: vi.fn(),
  assignTicket: vi.fn(),
}))
vi.mock('../services/locationService', () => ({ listBuildings: vi.fn() }))
vi.mock('../services/adminUserService', () => ({ listEngineers: vi.fn() }))

// GET /admin/tickets/1: an escalated P3 ticket, not yet assigned.
const TICKET = {
  ...makeAdminTicket({ escalation_requested: true }),
  description: 'My laptop loses Wi-Fi every 5-10 minutes.',
  escalation_reason: 'I have client calls all afternoon.',
  blocked_reason: null,
  acknowledged_at: null,
  assigned_at: null,
  resolved_at: null,
  created_by_email: 'jane@acme.inc',
  created_by_phone: '(555) 010-0100',
}

const NOTES = [
  { note_id: 1, ticket_id: 1, user_id: 1, author_name: 'Jane Doe', author_role: 'employee', note_text: 'Still dropping.', created_at: '2026-09-22T11:10:00-04:00' },
  { note_id: 2, ticket_id: 1, user_id: 4, author_name: 'Sam Tech', author_role: 'engineer', note_text: 'Checking the access point.', created_at: '2026-09-22T11:20:00-04:00' },
]

const HISTORY = [
  { history_id: 1, ticket_id: 1, from_status: null, to_status: 'open', changed_by_user_id: 1, changed_by_name: 'Jane Doe', changed_by_role: 'employee', reason: null, changed_at: '2026-09-22T10:00:00-04:00' },
]

function renderPage(route = '/admin/tickets/1', width = 1280) {
  const user = userEvent.setup()
  renderWithProviders(<App />, { route, user: ALEX, width })
  return user
}

const panel = (name) => screen.getByRole('region', { name })
const heading = () => screen.findByRole('heading', { level: 1, name: '#1 Wi-Fi keeps dropping' })

beforeEach(() => {
  vi.mocked(getTicket).mockReset().mockResolvedValue(TICKET)
  vi.mocked(listTicketNotes).mockReset().mockResolvedValue(NOTES)
  vi.mocked(listTicketHistory).mockReset().mockResolvedValue(HISTORY)
  vi.mocked(listAllTickets).mockReset().mockResolvedValue(ADMIN_TICKETS)
  vi.mocked(listBuildings).mockReset().mockResolvedValue([])
  vi.mocked(listEngineers).mockReset().mockResolvedValue(ENGINEERS)
  vi.mocked(assignTicket).mockReset()
})

describe('AdminTicketDetailsPage: loading and errors', () => {
  it('shows a placeholder while loading', () => {
    vi.mocked(getTicket).mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByLabelText('Loading ticket')).toHaveAttribute('aria-busy', 'true')
  })

  it.each(['/admin/tickets/abc', '/admin/tickets/0'])('treats %s as not found without calling the API', (route) => {
    renderPage(route)
    expect(screen.getByRole('heading', { level: 1, name: 'Ticket not found' })).toBeInTheDocument()
    expect(getTicket).not.toHaveBeenCalled()
  })

  it('shows a missing ticket as not found, with a way back', async () => {
    vi.mocked(getTicket).mockRejectedValue(new ApiError('Ticket not found', { status: 404 }))
    renderPage('/admin/tickets/77')
    expect(await screen.findByRole('heading', { level: 1, name: 'Ticket not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to the admin dashboard' })).toHaveAttribute('href', '/admin')
  })

  it('explains other failures and retries', async () => {
    vi.mocked(getTicket)
      .mockRejectedValueOnce(new ApiError('Something went wrong on our side. Please try again.', { status: 500 }))
      .mockResolvedValue(TICKET)
    const user = renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on our side.')
    expect(screen.getByRole('link', { name: 'Back to admin dashboard' })).toHaveAttribute('href', '/admin')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await heading()).toBeInTheDocument()
  })
})

describe('AdminTicketDetailsPage: the ticket', () => {
  it('opens from the all-tickets list', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/admin', user: ALEX })
    const table = await screen.findByRole('table', { name: 'All tickets' })

    await user.click(within(table).getByRole('link', { name: 'Wi-Fi keeps dropping' }))

    expect(await heading()).toBeInTheDocument()
    expect(getTicket).toHaveBeenCalledWith({ ticketId: '1' }, expect.anything())
  })

  it('shows priority, status and the escalation up top', async () => {
    renderPage()
    await heading()

    expect(screen.getByLabelText('Priority P3: One person')).toBeInTheDocument()
    expect(screen.getByText('Impact: Just me')).toBeInTheDocument()
    expect(screen.getByText('Escalated')).toBeInTheDocument()
    const escalation = screen.getByRole('alert')
    expect(escalation).toHaveTextContent('Jane Doe asked for an admin to review this ticket')
    expect(escalation).toHaveTextContent('I have client calls all afternoon.')
  })

  it('has no escalation alert when none was requested', async () => {
    vi.mocked(getTicket).mockResolvedValue({ ...TICKET, escalation_requested: false, escalation_reason: null })
    renderPage()
    await heading()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('Escalated')).not.toBeInTheDocument()
  })

  it('shows the details and how to reach the requester', async () => {
    renderPage()
    await heading()

    expect(within(panel('Details')).getByText('My laptop loses Wi-Fi every 5-10 minutes.')).toBeInTheDocument()
    expect(within(panel('Details')).getByText('Not assigned yet')).toBeInTheDocument()

    const requester = panel('Requester')
    expect(within(requester).getByText('Jane Doe')).toBeInTheDocument()
    expect(within(requester).getByRole('link', { name: 'jane@acme.inc' })).toHaveAttribute('href', 'mailto:jane@acme.inc')
    expect(within(requester).getByRole('link', { name: '(555) 010-0100' })).toHaveAttribute('href', 'tel:5550100100')
  })

  it('says when the requester gave no phone number', async () => {
    vi.mocked(getTicket).mockResolvedValue({ ...TICKET, created_by_phone: null })
    renderPage()
    await heading()
    expect(within(panel('Requester')).getByText('No phone number given')).toBeInTheDocument()
    expect(within(panel('Requester')).getAllByRole('link')).toHaveLength(1)
  })

  it('shows every note, read-only, and the status history', async () => {
    renderPage()
    await heading()

    const notes = panel('Notes')
    expect(await within(notes).findByText('Still dropping.')).toBeInTheDocument()
    expect(within(notes).getByText('Checking the access point.')).toBeInTheDocument()
    expect(within(notes).getByText('Sam Tech')).toBeInTheDocument()
    expect(within(notes).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(notes).queryByRole('button')).not.toBeInTheDocument()

    expect(await within(panel('Status history')).findByText('Jane Doe', { exact: false })).toBeInTheDocument()
    expect(listTicketNotes).toHaveBeenCalledWith({ ticketId: '1' }, expect.anything())
    expect(listTicketHistory).toHaveBeenCalledWith({ ticketId: '1' }, expect.anything())
  })

  it('works on a phone', async () => {
    renderPage('/admin/tickets/1', 375)
    await heading()
    expect(screen.getByRole('list', { name: 'Ticket workflow' })).toHaveStyle({ flexDirection: 'column' })
  })
})

describe('AdminTicketDetailsPage: assignment', () => {
  const assignment = () => panel('Assignment')
  const SAM_ON_IT = { ...TICKET, assigned_to_user_id: 4, assigned_to_name: 'Sam Tech', assigned_at: '2026-09-22T11:05:00-04:00', acknowledged_at: '2026-09-22T11:05:00-04:00' }

  it('assigns an unassigned ticket and refreshes the ticket and loads', async () => {
    vi.mocked(assignTicket).mockResolvedValue(SAM_ON_IT)
    const user = renderPage()
    await heading()
    expect(within(assignment()).getByText('No engineer yet.')).toBeInTheDocument()
    vi.mocked(getTicket).mockResolvedValue(SAM_ON_IT)

    await user.click(within(assignment()).getByRole('combobox', { name: 'Engineer' }))
    await user.click(await screen.findByRole('option', { name: 'Sam Tech · 3 active, 1 P1' }))
    await user.click(within(assignment()).getByRole('button', { name: 'Assign' }))

    expect(assignTicket).toHaveBeenCalledWith(1, '4')
    expect(await within(assignment()).findByRole('alert')).toHaveTextContent('Assigned to Sam Tech.')
    expect(await within(panel('Details')).findByText('Sam Tech')).toBeInTheDocument()
    expect(within(assignment()).getByText(/^Assigned Sep \d/)).toBeInTheDocument()
    expect(getTicket).toHaveBeenCalledTimes(2)
    expect(listEngineers).toHaveBeenCalledTimes(2)

    await user.click(within(assignment()).getByRole('button', { name: 'Close' }))
    expect(within(assignment()).queryByText('Assigned to Sam Tech.')).not.toBeInTheDocument()
  })

  it('offers to reassign, with the current engineer shown but not selectable', async () => {
    vi.mocked(getTicket).mockResolvedValue(SAM_ON_IT)
    const user = renderPage()
    await heading()

    expect(within(assignment()).getByText('Sam Tech')).toBeInTheDocument()
    await user.click(within(assignment()).getByRole('combobox', { name: 'Engineer' }))
    expect(await screen.findByRole('option', { name: 'Sam Tech · 3 active, 1 P1 (current)' })).toHaveAttribute('aria-disabled', 'true')
    await user.click(screen.getByRole('option', { name: 'Kim Fixit · 0 active' }))
    expect(within(assignment()).getByRole('button', { name: 'Reassign' })).toBeEnabled()
  })

  it('shows why the API refused', async () => {
    vi.mocked(assignTicket).mockRejectedValue(new ApiError('User 6 is not an engineer', { status: 400 }))
    const user = renderPage()
    await heading()

    await user.click(within(assignment()).getByRole('combobox', { name: 'Engineer' }))
    await user.click(await screen.findByRole('option', { name: 'Kim Fixit · 0 active' }))
    await user.click(within(assignment()).getByRole('button', { name: 'Assign' }))

    expect(await within(assignment()).findByRole('alert')).toHaveTextContent('User 6 is not an engineer')
    expect(getTicket).toHaveBeenCalledTimes(1)
  })

  it('never shows a raw error', async () => {
    vi.mocked(assignTicket).mockRejectedValue(new TypeError('boom'))
    const user = renderPage()
    await heading()

    await user.click(within(assignment()).getByRole('combobox', { name: 'Engineer' }))
    await user.click(await screen.findByRole('option', { name: 'Kim Fixit · 0 active' }))
    await user.click(within(assignment()).getByRole('button', { name: 'Assign' }))

    expect(await within(assignment()).findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.')
  })

  it('disables the form while assigning', async () => {
    let finish
    vi.mocked(assignTicket).mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const user = renderPage()
    await heading()

    await user.click(within(assignment()).getByRole('combobox', { name: 'Engineer' }))
    await user.click(await screen.findByRole('option', { name: 'Kim Fixit · 0 active' }))
    await user.click(within(assignment()).getByRole('button', { name: 'Assign' }))

    expect(within(assignment()).getByRole('button', { name: 'Assigning…' })).toBeDisabled()
    finish({ ...TICKET, assigned_to_user_id: 6, assigned_to_name: 'Kim Fixit' })
    expect(await within(assignment()).findByText('Assigned to Kim Fixit.')).toBeInTheDocument()
  })

  it.each([['resolved', 'Resolved'], ['closed', 'Closed']])('keeps the engineer on a %s ticket', async (status, label) => {
    vi.mocked(getTicket).mockResolvedValue({ ...SAM_ON_IT, status })
    renderPage()
    await heading()
    expect(within(assignment()).getByText(`${label} tickets keep their engineer and can't be reassigned.`)).toBeInTheDocument()
    expect(within(assignment()).queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('explains when engineers fail to load, and retries', async () => {
    vi.mocked(listEngineers)
      .mockRejectedValueOnce(new ApiError("Can't reach the server. Check your connection and try again.", { status: 0 }))
      .mockResolvedValue(ENGINEERS)
    const user = renderPage()
    await heading()

    expect(await within(assignment()).findByRole('alert')).toHaveTextContent("Can't reach the server.")
    await user.click(within(assignment()).getByRole('button', { name: 'Try again' }))
    expect(await within(assignment()).findByRole('combobox', { name: 'Engineer' })).toBeInTheDocument()
  })

  it('says when there are no engineers yet', async () => {
    vi.mocked(listEngineers).mockResolvedValue([])
    renderPage()
    await heading()
    expect(await within(assignment()).findByText(/No engineers yet/)).toBeInTheDocument()
  })
})
