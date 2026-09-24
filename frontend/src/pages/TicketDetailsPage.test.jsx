import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../App'
import { ApiError } from '../services/apiClient'
import {
  addNote,
  getMyTicket,
  listMyTickets,
  listNotes,
  listStatusHistory,
  requestEscalation,
} from '../services/ticketService'
import { makeTicket, TICKETS } from '../test/fixtures'
import { JANE, renderWithProviders } from '../test/renderWithProviders'
import { formatDateTime } from '../utils/ticketFormat'

vi.mock('../services/ticketService', () => ({
  getMyTicket: vi.fn(),
  listNotes: vi.fn(),
  listStatusHistory: vi.fn(),
  addNote: vi.fn(),
  requestEscalation: vi.fn(),
  listMyTickets: vi.fn(),
}))

const TICKET = makeTicket({
  ticket_id: 5,
  title: 'Printer jam',
  description: 'Every job jams.\nTried restarting.',
  category: 'printer',
  status: 'in_progress',
  affected_scope: 'floor',
  floor_number: 2,
  seat_number: null,
  assigned_to_user_id: 4,
  assigned_to_name: 'Sam Tech',
  acknowledged_at: '2026-09-22T11:00:00-04:00',
  assigned_at: '2026-09-22T11:05:00-04:00',
  resolved_at: null,
  blocked_reason: null,
  escalation_reason: null,
})

const NOTES = [
  { note_id: 1, ticket_id: 5, user_id: 4, author_name: 'Sam Tech', author_role: 'engineer', note_text: 'Ordering a roller.', created_at: '2026-09-22T11:10:00-04:00' },
  { note_id: 2, ticket_id: 5, user_id: JANE.user_id, author_name: 'Jane Doe', author_role: 'employee', note_text: 'Thanks!', created_at: '2026-09-22T11:20:00-04:00' },
]

const change = (history_id, from_status, to_status, extra = {}) => ({
  history_id,
  ticket_id: 5,
  from_status,
  to_status,
  changed_by_user_id: 4,
  changed_by_name: 'Sam Tech',
  changed_by_role: 'engineer',
  reason: null,
  changed_at: `2026-09-22T1${history_id}:00:00-04:00`,
  ...extra,
})
// The time a change() row happened, as the page shows it.
const at = (historyId) => formatDateTime(`2026-09-22T1${historyId}:00:00-04:00`)

const OPENED = change(1, null, 'open', { changed_by_user_id: JANE.user_id, changed_by_name: 'Jane Doe', changed_by_role: 'employee' })
const STARTED = change(2, 'open', 'in_progress')

// Open -> In progress -> Blocked -> In progress -> Resolved.
const RESOLVED_HISTORY = [
  OPENED,
  STARTED,
  change(3, 'in_progress', 'blocked', { reason: 'Waiting on a roller' }),
  change(4, 'blocked', 'in_progress'),
  change(5, 'in_progress', 'resolved', { reason: 'New roller fitted' }),
]

function renderPage(route = '/tickets/5', width = 1280) {
  const user = userEvent.setup()
  renderWithProviders(<App />, { route, user: JANE, width })
  return user
}

const panel = (name) => screen.getByRole('region', { name })
const heading = () => screen.findByRole('heading', { level: 1, name: '#5 Printer jam' })
const steps = () => within(screen.getByRole('list', { name: 'Ticket workflow' })).getAllByRole('listitem')
const currentStep = () => steps().find((li) => li.getAttribute('aria-current') === 'step')

beforeEach(() => {
  vi.mocked(getMyTicket).mockReset().mockResolvedValue(TICKET)
  vi.mocked(listNotes).mockReset().mockResolvedValue(NOTES)
  vi.mocked(listStatusHistory).mockReset().mockResolvedValue([OPENED, STARTED])
  vi.mocked(addNote).mockReset()
  vi.mocked(requestEscalation).mockReset()
  vi.mocked(listMyTickets).mockReset().mockResolvedValue(TICKETS)
})

describe('TicketDetailsPage: loading and errors', () => {
  it('shows a placeholder while loading', () => {
    vi.mocked(getMyTicket).mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByLabelText('Loading ticket')).toHaveAttribute('aria-busy', 'true')
  })

  it.each(['/tickets/abc', '/tickets/0', '/tickets/99999999999'])(
    'treats %s as not found without calling the API',
    (route) => {
      renderPage(route)
      expect(screen.getByRole('heading', { level: 1, name: 'Ticket not found' })).toBeInTheDocument()
      expect(getMyTicket).not.toHaveBeenCalled()
    },
  )

  it("shows someone else's (or a missing) ticket as not found", async () => {
    vi.mocked(getMyTicket).mockRejectedValue(new ApiError('Ticket not found', { status: 404 }))
    renderPage('/tickets/77')
    expect(await screen.findByRole('heading', { level: 1, name: 'Ticket not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to my dashboard' })).toHaveAttribute('href', '/dashboard')
  })

  it('explains other failures and retries', async () => {
    vi.mocked(getMyTicket)
      .mockRejectedValueOnce(new ApiError('Something went wrong on our side. Please try again.', { status: 500 }))
      .mockResolvedValue(TICKET)
    const user = renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on our side.')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await heading()).toBeInTheDocument()
  })
})

describe('TicketDetailsPage: the ticket', () => {
  it('opens from the dashboard list', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/dashboard', user: JANE })
    const table = await screen.findByRole('table', { name: 'My tickets' })

    await user.click(within(table).getByRole('link', { name: '#5' }))

    expect(await heading()).toBeInTheDocument()
    expect(getMyTicket).toHaveBeenCalledWith({ ticketId: '5' }, expect.anything())
    expect(listStatusHistory).toHaveBeenCalledWith({ ticketId: '5' }, expect.anything())
  })

  it('shows the status, impact and engineer under the title, and the details', async () => {
    renderPage()
    await heading()

    expect(screen.getByText('Impact: My floor')).toBeInTheDocument()
    expect(screen.getByText('Engineer: Sam Tech')).toBeInTheDocument()
    expect(screen.queryByText('Escalated')).not.toBeInTheDocument()

    const details = panel('Details')
    expect(within(details).getByText(/Every job jams\.\s+Tried restarting\./)).toBeInTheDocument()
    const facts = Object.fromEntries(
      within(details).getAllByRole('term').map((dt) => [dt.textContent, dt.nextSibling.textContent]),
    )
    expect(facts).toEqual({
      Category: 'Printer / Peripheral',
      Impact: 'My floor',
      Building: 'Building A',
      'Floor · Seat': 'Floor 2',
      Created: formatDateTime(TICKET.created_at),
      'Last update': expect.stringMatching(/ago$/),
    })
    expect(document.body).not.toHaveTextContent(/priority|urgency|\bP[123]\b/i)
  })

  it('says when no engineer is assigned yet', async () => {
    vi.mocked(getMyTicket).mockResolvedValue({ ...TICKET, status: 'open', assigned_to_name: null, acknowledged_at: null, assigned_at: null })
    renderPage()
    await heading()
    expect(screen.getByText('Engineer: Not assigned yet')).toBeInTheDocument()
  })

  it('leaves out a floor and seat the ticket does not have', async () => {
    vi.mocked(getMyTicket).mockResolvedValue({ ...TICKET, floor_number: null, seat_number: null })
    renderPage()
    await heading()
    expect(within(panel('Details')).queryByText('Floor · Seat')).not.toBeInTheDocument()
  })

  it('shows both floor and seat when the ticket has them', async () => {
    vi.mocked(getMyTicket).mockResolvedValue({ ...TICKET, seat_number: '204' })
    renderPage()
    await heading()
    expect(within(panel('Details')).getByText('Floor 2 · Seat 204')).toBeInTheDocument()
  })

  it('marks an escalated ticket beside its status', async () => {
    vi.mocked(getMyTicket).mockResolvedValue({ ...TICKET, escalation_requested: true, escalation_reason: 'x' })
    renderPage()
    await heading()
    expect(screen.getByText('Escalated')).toBeInTheDocument()
  })

  it('confirms a ticket that was just created', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: { pathname: '/tickets/5', state: { createdTicket: true } }, user: JANE })
    await heading()

    expect(screen.getByRole('alert')).toHaveTextContent('Ticket created.')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByText(/Ticket created/)).not.toBeInTheDocument()
  })
})

describe('TicketDetailsPage: progress', () => {
  it('shows each step with when it happened, and marks the current one', async () => {
    renderPage()
    await heading()
    await screen.findByText(`Sam Tech started ${at(2)}`)

    const items = within(panel('Progress')).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      `Open (done)Received ${formatDateTime(TICKET.created_at)}`,
      `In Progress (current status)Sam Tech started ${at(2)}`,
      'Blocked (only if something holds it up)Only if something holds it up',
      'Resolved (not reached yet)—',
      'Closed (not reached yet)—',
    ])
    expect(currentStep()).toHaveTextContent('In Progress (current status)')
    expect(document.body).not.toHaveTextContent(/priority|\bP[123]\b/i)
  })

  it('shows the blocked reason on the Blocked step, which becomes the current one', async () => {
    vi.mocked(getMyTicket).mockResolvedValue({ ...TICKET, status: 'blocked', blocked_reason: 'Waiting on parts' })
    vi.mocked(listStatusHistory).mockResolvedValue([OPENED, STARTED, change(3, 'in_progress', 'blocked', { reason: 'Waiting on parts' })])
    renderPage()
    await heading()

    await screen.findByText(`Waiting on parts · since ${at(3)}`)
    expect(currentStep()).toHaveTextContent(`Blocked (current status)Waiting on parts · since ${at(3)}`)
    expect(steps()[1]).toHaveTextContent('In Progress (paused while blocked)')
  })

  it("shows a resumed, then resolved ticket, that it was once blocked, and the engineer's summary", async () => {
    vi.mocked(getMyTicket).mockResolvedValue({ ...TICKET, status: 'resolved' })
    vi.mocked(listStatusHistory).mockResolvedValue(RESOLVED_HISTORY)
    renderPage()
    await heading()
    await screen.findByText(`Sam Tech resolved it ${at(5)}`)

    expect(steps().map((li) => li.textContent)).toEqual([
      `Open (done)Received ${formatDateTime(TICKET.created_at)}`,
      `In Progress (done)Work resumed ${at(4)}`,
      `Blocked (only if something holds it up)Was blocked ${at(3)}`,
      `Resolved (current status)Sam Tech resolved it ${at(5)}“New roller fitted”`,
      'Closed (not reached yet)—',
    ])
    // Clamped to two lines on desktop, so the whole reason is in the tooltip.
    expect(screen.getByText('“New roller fitted”')).toHaveAttribute('title', 'New roller fitted')
  })

  it('shows who closed a ticket', async () => {
    vi.mocked(getMyTicket).mockResolvedValue({ ...TICKET, status: 'closed' })
    vi.mocked(listStatusHistory).mockResolvedValue([
      ...RESOLVED_HISTORY,
      change(6, 'resolved', 'closed', { changed_by_user_id: 9, changed_by_name: 'Ada Admin', changed_by_role: 'admin', reason: 'Confirmed with Jane' }),
    ])
    renderPage()
    await heading()
    expect(await screen.findByText(`Ada Admin closed it ${at(6)}`)).toBeInTheDocument()
    expect(currentStep()).toHaveTextContent('“Confirmed with Jane”')
    expect(currentStep()).toHaveTextContent('Closed (current status)')
  })

  it('says "Reopened", and what is still wrong, when a finished ticket goes back to work', async () => {
    vi.mocked(listStatusHistory).mockResolvedValue([
      ...RESOLVED_HISTORY,
      change(6, 'resolved', 'in_progress', { changed_by_user_id: 9, changed_by_name: 'Ada Admin', changed_by_role: 'admin', reason: 'Jammed again the next day' }),
    ])
    renderPage()
    await heading()
    expect(await screen.findByText(`Reopened ${at(6)}`)).toBeInTheDocument()
    expect(currentStep()).toHaveTextContent(`In Progress (current status)Reopened ${at(6)}“Jammed again the next day”`)
    // Only reached steps show a reason: the old resolve summary is gone with the reopen.
    expect(screen.queryByText('“New roller fitted”')).not.toBeInTheDocument()
  })

  it('says "Reopened", and why, when a finished ticket goes back to Open', async () => {
    vi.mocked(getMyTicket).mockResolvedValue({ ...TICKET, status: 'open' })
    vi.mocked(listStatusHistory).mockResolvedValue([
      ...RESOLVED_HISTORY,
      change(6, 'resolved', 'open', { changed_by_user_id: 9, changed_by_name: 'Ada Admin', changed_by_role: 'admin', reason: 'Jammed again' }),
    ])
    renderPage()
    await heading()
    expect(await screen.findByText(`Reopened ${at(6)}`)).toBeInTheDocument()
    expect(currentStep()).toHaveTextContent(`Open (current status)Reopened ${at(6)}“Jammed again”`)
    expect(steps()[1]).toHaveTextContent('In Progress (not reached yet)—')
  })

  it('names you when you made the change', async () => {
    vi.mocked(getMyTicket).mockResolvedValue({ ...TICKET, status: 'closed' })
    vi.mocked(listStatusHistory).mockResolvedValue([
      ...RESOLVED_HISTORY,
      change(6, 'resolved', 'closed', { changed_by_user_id: JANE.user_id, changed_by_name: 'Jane Doe', changed_by_role: 'employee' }),
    ])
    renderPage()
    await heading()
    expect(await screen.findByText(`You closed it ${at(6)}`)).toBeInTheDocument()
  })

  it('still shows the steps when the history fails to load, just without their times', async () => {
    vi.mocked(listStatusHistory).mockRejectedValue(new ApiError("Can't reach the server.", { status: 0 }))
    renderPage()
    await heading()
    await waitFor(() => expect(listStatusHistory).toHaveBeenCalled())

    expect(steps()).toHaveLength(5)
    expect(steps()[1].textContent).toBe('In Progress (current status)')
  })
})

describe('TicketDetailsPage: notes', () => {
  it('lists notes oldest first, naming the engineer and "You"', async () => {
    renderPage()
    await heading()
    const notes = within(panel('Notes'))
    expect(notes.getByText('your conversation with the engineer')).toBeInTheDocument()
    const items = await notes.findAllByRole('listitem')
    expect(items[0]).toHaveTextContent(/^Sam Tech · Engineer · .+ ago\s*Ordering a roller\.$/)
    expect(items[1]).toHaveTextContent(/^You · Employee · .+ ago\s*Thanks!$/)
  })

  it('shows a placeholder while notes load', async () => {
    vi.mocked(listNotes).mockReturnValueOnce(new Promise(() => {}))
    renderPage()
    await heading()
    expect(within(panel('Notes')).getByLabelText('Loading notes')).toBeInTheDocument()
  })

  it('says when there are no notes', async () => {
    vi.mocked(listNotes).mockResolvedValue([])
    renderPage()
    expect(await within(await screen.findByRole('region', { name: 'Notes' })).findByText('No notes yet.')).toBeInTheDocument()
  })

  it('explains a failed notes load and retries', async () => {
    vi.mocked(listNotes).mockRejectedValueOnce(new ApiError("Can't reach the server.", { status: 0 })).mockResolvedValue(NOTES)
    const user = renderPage()
    await heading()

    const notes = within(panel('Notes'))
    await user.click(await notes.findByRole('button', { name: 'Try again' }))
    expect(await notes.findByText('Ordering a roller.')).toBeInTheDocument()
  })

  it('sends a note, then refreshes the ticket and notes', async () => {
    vi.mocked(addNote).mockResolvedValue({ note_id: 3 })
    const user = renderPage()
    await heading()
    const notes = within(panel('Notes'))
    const box = notes.getByRole('textbox', { name: 'Add a note' })

    await user.type(box, 'It jammed again.')
    await user.click(notes.getByRole('button', { name: 'Send' }))

    expect(addNote).toHaveBeenCalledWith(5, 'It jammed again.')
    await waitFor(() => expect(box).toHaveValue(''))
    await waitFor(() => expect(listNotes).toHaveBeenCalledTimes(2))
    expect(getMyTicket).toHaveBeenCalledTimes(2)
  })

  it('sends with Enter', async () => {
    vi.mocked(addNote).mockResolvedValue({ note_id: 3 })
    const user = renderPage()
    await heading()

    await user.type(within(panel('Notes')).getByRole('textbox', { name: 'Add a note' }), 'Still jammed{Enter}')

    expect(addNote).toHaveBeenCalledWith(5, 'Still jammed')
  })

  it('refuses an empty note and clears the message on typing', async () => {
    const user = renderPage()
    await heading()
    const notes = within(panel('Notes'))

    await user.click(notes.getByRole('button', { name: 'Send' }))
    expect(notes.getByRole('alert')).toHaveTextContent('Write a note first.')
    expect(notes.getByRole('textbox', { name: 'Add a note' })).toHaveAttribute('aria-invalid', 'true')
    expect(addNote).not.toHaveBeenCalled()

    await user.type(notes.getByRole('textbox', { name: 'Add a note' }), 'x')
    expect(notes.queryByText('Write a note first.')).not.toBeInTheDocument()
  })

  it('counts characters only near the limit, and refuses a note that is too long', async () => {
    const user = renderPage()
    await heading()
    const notes = within(panel('Notes'))
    const box = notes.getByRole('textbox', { name: 'Add a note' })

    await user.type(box, 'short')
    expect(notes.queryByText(/\/2000$/)).not.toBeInTheDocument()

    await user.clear(box)
    await user.click(box)
    await user.paste('x'.repeat(1900))
    expect(notes.getByText('1900/2000')).toBeInTheDocument()

    await user.paste('x'.repeat(101))
    await user.click(notes.getByRole('button', { name: 'Send' }))
    expect(notes.getByRole('alert')).toHaveTextContent('Use 2000 characters or fewer.')
    expect(addNote).not.toHaveBeenCalled()
  })

  it('disables the note box while sending', async () => {
    vi.mocked(addNote).mockReturnValue(new Promise(() => {}))
    const user = renderPage()
    await heading()
    const notes = within(panel('Notes'))
    await user.type(notes.getByRole('textbox', { name: 'Add a note' }), 'hi')

    await user.click(notes.getByRole('button', { name: 'Send' }))

    expect(notes.getByRole('button', { name: 'Sending…' })).toBeDisabled()
    expect(notes.getByRole('textbox', { name: 'Add a note' })).toBeDisabled()
  })

  it.each([
    ['API error', new ApiError("Closed tickets can't take new notes", { status: 409 }), "Closed tickets can't take new notes"],
    ['unexpected error', new TypeError('boom'), 'Something went wrong. Please try again.'],
  ])('shows an %s under the note box and keeps the text', async (_label, error, message) => {
    vi.mocked(addNote).mockRejectedValue(error)
    const user = renderPage()
    await heading()
    const notes = within(panel('Notes'))
    await user.type(notes.getByRole('textbox', { name: 'Add a note' }), 'hello')

    await user.click(notes.getByRole('button', { name: 'Send' }))

    expect(await notes.findByRole('alert')).toHaveTextContent(message)
    expect(notes.getByRole('textbox', { name: 'Add a note' })).toHaveValue('hello')
  })
})

describe('TicketDetailsPage: escalation', () => {
  const escalation = () => within(panel('Escalation'))

  it('explains when to escalate, asks what changed, sends it, then refreshes', async () => {
    vi.mocked(requestEscalation).mockResolvedValue({})
    const user = renderPage()
    await heading()
    expect(escalation().getByText(/Only escalate if the issue has become more urgent/)).toBeInTheDocument()

    await user.click(escalation().getByRole('button', { name: 'Escalate' }))
    await user.click(escalation().getByRole('button', { name: 'Escalate ticket' }))
    expect(escalation().getByText('Tell the facility admin what changed.')).toBeInTheDocument()

    await user.type(escalation().getByRole('textbox', { name: 'What changed?' }), 'Payroll is due today.')
    await user.click(escalation().getByRole('button', { name: 'Escalate ticket' }))

    expect(requestEscalation).toHaveBeenCalledWith(5, 'Payroll is due today.')
    await waitFor(() => expect(escalation().queryByRole('textbox')).not.toBeInTheDocument())
    expect(getMyTicket).toHaveBeenCalledTimes(2)
    expect(listNotes).toHaveBeenCalledTimes(2)
  })

  it('limits the reason length and can be cancelled', async () => {
    const user = renderPage()
    await heading()
    await user.click(escalation().getByRole('button', { name: 'Escalate' }))
    const box = escalation().getByRole('textbox', { name: 'What changed?' })
    expect(box).toHaveFocus()
    await user.paste('x'.repeat(1001))

    await user.click(escalation().getByRole('button', { name: 'Escalate ticket' }))
    expect(escalation().getByText('Use 1000 characters or fewer.')).toBeInTheDocument()

    await user.type(box, 'y')
    expect(escalation().queryByText('Use 1000 characters or fewer.')).not.toBeInTheDocument()
    await user.click(escalation().getByRole('button', { name: 'Cancel' }))
    expect(escalation().queryByRole('textbox')).not.toBeInTheDocument()
    expect(escalation().getByRole('button', { name: 'Escalate' })).toBeInTheDocument()
    expect(requestEscalation).not.toHaveBeenCalled()
  })

  it('disables the form while sending', async () => {
    vi.mocked(requestEscalation).mockReturnValue(new Promise(() => {}))
    const user = renderPage()
    await heading()
    await user.click(escalation().getByRole('button', { name: 'Escalate' }))
    await user.type(escalation().getByRole('textbox', { name: 'What changed?' }), 'Urgent')

    await user.click(escalation().getByRole('button', { name: 'Escalate ticket' }))

    expect(escalation().getByRole('button', { name: 'Sending…' })).toBeDisabled()
    expect(escalation().getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(escalation().getByRole('textbox', { name: 'What changed?' })).toBeDisabled()
  })

  it.each([
    ['API error', new ApiError('Escalation has already been requested for this ticket', { status: 409 }), 'Escalation has already been requested for this ticket'],
    ['unexpected error', new TypeError('boom'), 'Something went wrong. Please try again.'],
  ])('shows an %s under the reason and keeps it', async (_label, error, message) => {
    vi.mocked(requestEscalation).mockRejectedValue(error)
    const user = renderPage()
    await heading()
    await user.click(escalation().getByRole('button', { name: 'Escalate' }))
    await user.type(escalation().getByRole('textbox', { name: 'What changed?' }), 'Urgent')

    await user.click(escalation().getByRole('button', { name: 'Escalate ticket' }))

    expect(await escalation().findByText(message)).toBeInTheDocument()
    expect(escalation().getByRole('textbox', { name: 'What changed?' })).toHaveValue('Urgent')
  })

  it('shows an escalation already requested, with the reason', async () => {
    vi.mocked(getMyTicket).mockResolvedValue({ ...TICKET, escalation_requested: true, escalation_reason: 'Payroll is due today.' })
    renderPage()
    await heading()
    expect(escalation().getByText('Escalation requested')).toBeInTheDocument()
    expect(escalation().getByText(/Payroll is due today\./)).toBeInTheDocument()
    expect(escalation().getByText('The facility admin has been notified.')).toBeInTheDocument()
    expect(escalation().queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('TicketDetailsPage: closed tickets', () => {
  beforeEach(() => {
    vi.mocked(getMyTicket).mockResolvedValue({ ...TICKET, status: 'closed', resolved_at: '2026-09-22T15:00:00-04:00' })
  })

  it('keeps the notes readable but has no note box or escalation', async () => {
    renderPage()
    await heading()

    expect(within(panel('Notes')).getByText("This ticket is closed, so new notes can't be added.")).toBeInTheDocument()
    expect(within(panel('Notes')).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(panel('Escalation')).getByText("Closed tickets can't be escalated.")).toBeInTheDocument()
    expect(await within(panel('Notes')).findByText('Ordering a roller.')).toBeInTheDocument()
    expect(currentStep()).toHaveTextContent('Closed (current status)')
  })

  it('still shows an escalation made before closing', async () => {
    vi.mocked(getMyTicket).mockResolvedValue({ ...TICKET, status: 'closed', escalation_requested: true, escalation_reason: 'x' })
    renderPage()
    await heading()
    expect(within(panel('Escalation')).getByText('Escalation requested')).toBeInTheDocument()
  })
})

describe('TicketDetailsPage: on a phone', () => {
  const tab = (name) => screen.getByRole('tab', { name })

  it('shows a summary, then opens on the Notes tab', async () => {
    renderPage('/tickets/5', 375)
    await heading()

    expect(await screen.findByText(`In Progress since ${at(2)} · Next: Resolved`)).toBeInTheDocument()
    expect(screen.getByText('Sam Tech')).toBeInTheDocument()
    expect(await screen.findByRole('tab', { name: 'Notes (2)' })).toHaveAttribute('aria-selected', 'true')
    expect(within(screen.getByRole('tabpanel')).getByText('Ordering a roller.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Details' })).not.toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/priority|\bP[123]\b/i)
  })

  it('says what holds up a blocked ticket in the summary', async () => {
    vi.mocked(getMyTicket).mockResolvedValue({ ...TICKET, status: 'blocked', blocked_reason: 'Waiting on parts' })
    renderPage('/tickets/5', 375)
    await heading()
    expect(screen.getByText('Blocked: Waiting on parts')).toBeInTheDocument()
  })

  it('sends a note with the icon button', async () => {
    vi.mocked(addNote).mockResolvedValue({ note_id: 3 })
    const user = renderPage('/tickets/5', 375)
    await heading()

    await user.type(screen.getByRole('textbox', { name: 'Add a note' }), 'On my way out')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(addNote).toHaveBeenCalledWith(5, 'On my way out')
  })

  it('has the details and escalation on the Details tab', async () => {
    vi.mocked(requestEscalation).mockResolvedValue({})
    const user = renderPage('/tickets/5', 375)
    await heading()

    await user.click(tab('Details'))
    expect(within(panel('Details')).getByText('Printer / Peripheral')).toBeInTheDocument()
    await user.click(within(panel('Escalation')).getByRole('button', { name: 'Escalate this ticket' }))
    await user.type(screen.getByRole('textbox', { name: 'What changed?' }), 'Payroll is due today.')
    await user.click(screen.getByRole('button', { name: 'Escalate ticket' }))

    expect(requestEscalation).toHaveBeenCalledWith(5, 'Payroll is due today.')
  })

  it('lists the steps with their times on the Progress tab', async () => {
    vi.mocked(getMyTicket).mockResolvedValue({ ...TICKET, status: 'resolved' })
    vi.mocked(listStatusHistory).mockResolvedValue(RESOLVED_HISTORY)
    const user = renderPage('/tickets/5', 375)
    await heading()

    await user.click(tab('Progress'))
    expect(steps()).toHaveLength(5)
    expect(await screen.findByText(`Sam Tech resolved it ${at(5)}`)).toBeInTheDocument()
    expect(currentStep()).toHaveTextContent('Resolved (current status)')
    // The phone list has room, so the reason isn't cut or given a tooltip.
    expect(screen.getByText('“New roller fitted”')).not.toHaveAttribute('title')
  })
})
