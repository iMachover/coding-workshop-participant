import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../App'
import { ApiError } from '../services/apiClient'
import {
  addAssignedTicketNote,
  changeTicketStatus,
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
  changeTicketStatus: vi.fn(),
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
  vi.mocked(changeTicketStatus).mockReset()
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

    await user.click(within(table).getByRole('link', { name: '#9' }))

    expect(await heading()).toBeInTheDocument()
    expect(getAssignedTicket).toHaveBeenCalledWith({ ticketId: '9' }, expect.anything())
  })

  it('shows priority, the escalation, the details and how to reach the requester', async () => {
    renderPage()
    await heading()

    expect(screen.getByLabelText('Priority P3: One person')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Jane Doe asked for an admin to review this ticket')
    expect(within(panel('Progress')).getByRole('list', { name: 'Ticket workflow' })).toBeInTheDocument()
    const details = panel('Details')
    expect(within(details).getByText('My laptop loses Wi-Fi every 5-10 minutes.')).toBeInTheDocument()
    expect(within(details).getByText('P3 · One person')).toBeInTheDocument()
    expect(within(details).getByText('Yes')).toBeInTheDocument()
    const requester = panel('Requester')
    expect(within(requester).getByText('jane@acme.inc')).toBeInTheDocument()
    expect(within(requester).getByRole('link', { name: 'Email' })).toHaveAttribute('href', 'mailto:jane@acme.inc')
    expect(within(requester).getByRole('link', { name: '555-0100' })).toHaveAttribute('href', 'tel:5550100')
    expect(await within(panel('Status history')).findByText(/Jane Doe/)).toBeInTheDocument()
    expect(listAssignedTicketHistory).toHaveBeenCalledWith({ ticketId: '9' }, expect.anything())
  })

  it('says when the requester gave no phone number', async () => {
    vi.mocked(getAssignedTicket).mockResolvedValue({ ...TICKET, created_by_phone: null })
    renderPage()
    await heading()
    expect(within(panel('Requester')).getByText('No phone given')).toBeInTheDocument()
    expect(within(panel('Requester')).getAllByRole('link')).toHaveLength(1)
  })

  it('shows a blocked ticket paused at In Progress, with the reason', async () => {
    vi.mocked(getAssignedTicket).mockResolvedValue({ ...TICKET, status: 'blocked', blocked_reason: 'Waiting on parts' })
    renderPage()
    await heading()
    const workflow = within(panel('Progress')).getByRole('list', { name: 'Ticket workflow' })
    expect(workflow).toHaveTextContent('In Progress (paused while blocked)Blocked: Waiting on parts')
  })

  it('works on a phone: progress bars, tabs, and the status buttons pinned below', async () => {
    const user = renderPage('/engineer/tickets/9', 375)
    await heading()

    expect(within(panel('Progress')).getByText('Step 2 of 4 · In Progress')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true')
    expect(within(panel('Details')).getByText('My laptop loses Wi-Fi every 5-10 minutes.')).toBeInTheDocument()
    expect(within(panel('Requester')).getByRole('link', { name: 'Email jane@acme.inc' })).toHaveAttribute('href', 'mailto:jane@acme.inc')
    expect(within(panel('Change status')).getByRole('button', { name: 'Mark resolved' })).toBeInTheDocument()

    // On Notes, the note box takes the status buttons' place.
    await user.click(await screen.findByRole('tab', { name: 'Notes (1)' }))
    expect(within(panel('Notes')).getByText('Still dropping.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Add a note' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Change status' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'History' }))
    expect(await within(panel('Status history')).findByText(/Jane Doe/)).toBeInTheDocument()
    expect(panel('Change status')).toBeInTheDocument()
  })
})

describe('EngineerTicketDetailsPage: notes', () => {
  it('shows the conversation oldest first, with my own notes as "You"', async () => {
    vi.mocked(listAssignedTicketNotes).mockResolvedValue([...NOTES, SAMS_NOTE])
    renderPage()
    await heading()
    const items = await within(panel('Notes')).findAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^Jane Doe · .*Still dropping\.$/),
      expect.stringMatching(/^You · .*Swapping the access point\.$/),
    ])
    expect(panel('Notes')).toHaveTextContent('2 · the requester sees these')
  })

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
    await user.click(within(notes).getByRole('button', { name: 'Send' }))

    expect(addAssignedTicketNote).toHaveBeenCalledWith(9, 'Swapping the access point.')
    expect(await within(notes).findByText('Swapping the access point.')).toBeInTheDocument()
    expect(within(notes).getByText(/^You · /)).toBeInTheDocument()
    expect(box).toHaveValue('')
    expect(getAssignedTicket).toHaveBeenCalledTimes(2)
  })

  it('sends with Enter, and asks for text first', async () => {
    vi.mocked(addAssignedTicketNote).mockResolvedValue(SAMS_NOTE)
    const user = renderPage()
    await heading()
    const box = within(panel('Notes')).getByRole('textbox', { name: 'Add a note' })

    await user.type(box, '   {Enter}')
    expect(within(panel('Notes')).getByRole('alert')).toHaveTextContent('Write a note first.')
    expect(addAssignedTicketNote).not.toHaveBeenCalled()

    await user.type(box, 'On my way.{Enter}')
    expect(addAssignedTicketNote).toHaveBeenCalledWith(9, 'On my way.')
  })

  it('shows why a note was refused', async () => {
    vi.mocked(addAssignedTicketNote).mockRejectedValue(new ApiError("Closed tickets can't take new notes", { status: 409 }))
    const user = renderPage()
    await heading()

    await user.type(within(panel('Notes')).getByRole('textbox', { name: 'Add a note' }), 'Done.')
    await user.click(within(panel('Notes')).getByRole('button', { name: 'Send' }))

    expect(await within(panel('Notes')).findByRole('alert')).toHaveTextContent("Closed tickets can't take new notes")
  })

  it('takes no notes on a closed ticket', async () => {
    vi.mocked(getAssignedTicket).mockResolvedValue({ ...TICKET, status: 'closed' })
    renderPage()
    await heading()
    expect(within(panel('Notes')).getByText("This ticket is closed, so new notes can't be added.")).toBeInTheDocument()
    expect(within(panel('Notes')).queryByRole('textbox')).not.toBeInTheDocument()
  })
})

describe('EngineerTicketDetailsPage: changing status', () => {
  const controls = () => screen.getByRole('region', { name: 'Change status' })
  const buttons = () => within(controls()).getAllByRole('button').map((b) => b.textContent)
  const renderWith = (status, extra = {}) => {
    vi.mocked(getAssignedTicket).mockResolvedValue({ ...TICKET, status, ...extra })
    return renderPage()
  }

  it.each([
    ['open', ['Start work']],
    ['in_progress', ['Mark blocked', 'Mark resolved']],
    ['blocked', ['Resume work']],
    ['resolved', ['Reopen']],
  ])('offers only the allowed moves when %s, main one last', async (status, expected) => {
    renderWith(status)
    await heading()
    expect(buttons()).toEqual(expected)
  })

  it('explains a resolved ticket waits for an admin', async () => {
    renderWith('resolved')
    await heading()
    expect(controls()).toHaveTextContent('Waiting for the admin to close it')
  })

  it('says a closed ticket can\'t change', async () => {
    renderWith('closed')
    await heading()
    expect(controls()).toHaveTextContent("This ticket is closed, so its status can't change.")
    expect(within(controls()).queryByRole('button')).not.toBeInTheDocument()
  })

  it('starts work in one click, refreshes the ticket and history, and says so', async () => {
    vi.mocked(changeTicketStatus).mockResolvedValue({ ...TICKET, status: 'in_progress' })
    const user = renderWith('open')
    await heading()
    vi.mocked(getAssignedTicket).mockResolvedValue({ ...TICKET, status: 'in_progress' })

    await user.click(within(controls()).getByRole('button', { name: 'Start work' }))

    expect(changeTicketStatus).toHaveBeenCalledWith(9, 'in_progress', undefined)
    expect(await screen.findByText('Status changed to In Progress.')).toBeInTheDocument()
    expect(await within(controls()).findByRole('button', { name: 'Mark resolved' })).toBeInTheDocument()
    expect(getAssignedTicket).toHaveBeenCalledTimes(2)
    expect(listAssignedTicketHistory).toHaveBeenCalledTimes(2)

    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByText(/Status changed/)).not.toBeInTheDocument())
  })

  it('asks why inline before blocking', async () => {
    vi.mocked(changeTicketStatus).mockResolvedValue({ ...TICKET, status: 'blocked', blocked_reason: 'Waiting on parts' })
    const user = renderWith('in_progress')
    await heading()

    await user.click(within(controls()).getByRole('button', { name: 'Mark blocked' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const box = within(controls()).getByRole('textbox', { name: 'Why is the work paused?' })
    expect(box).toHaveFocus()
    expect(box).toHaveAttribute('placeholder', 'Why is it blocked? The requester will see this.')
    // While asking, the reason box's buttons replace the status buttons.
    expect(buttons()).toEqual(['Mark blocked', 'Cancel'])

    await user.click(within(controls()).getByRole('button', { name: 'Mark blocked' }))
    expect(within(controls()).getByRole('alert')).toHaveTextContent('Write a reason first.')
    expect(changeTicketStatus).not.toHaveBeenCalled()

    await user.type(box, '  Waiting on parts {Enter}')

    expect(changeTicketStatus).toHaveBeenCalledWith(9, 'blocked', 'Waiting on parts')
    expect(await screen.findByText('Status changed to Blocked.')).toBeInTheDocument()
    expect(within(controls()).queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('asks what was done before resolving, and limits the length', async () => {
    const user = renderWith('in_progress')
    await heading()

    await user.click(within(controls()).getByRole('button', { name: 'Mark resolved' }))
    const box = within(controls()).getByRole('textbox', { name: 'What did you do?' })
    await user.click(box)
    await user.paste('x'.repeat(501))
    await user.click(within(controls()).getByRole('button', { name: 'Mark resolved' }))

    expect(within(controls()).getByRole('alert')).toHaveTextContent('Use 500 characters or fewer.')
    expect(changeTicketStatus).not.toHaveBeenCalled()
  })

  it('keeps the reason box open with the API\'s reason when a move is refused, and cancels cleanly', async () => {
    vi.mocked(changeTicketStatus).mockRejectedValue(
      new ApiError('Blocked tickets can\'t be resolved. Unblock it first.', { status: 409 }),
    )
    const user = renderWith('in_progress')
    await heading()

    await user.click(within(controls()).getByRole('button', { name: 'Mark resolved' }))
    await user.type(within(controls()).getByRole('textbox'), 'Fixed{Enter}')

    expect(await within(controls()).findByRole('alert')).toHaveTextContent("Blocked tickets can't be resolved. Unblock it first.")
    expect(within(controls()).getByRole('textbox')).toHaveValue('Fixed')
    await user.click(within(controls()).getByRole('button', { name: 'Cancel' }))
    expect(within(controls()).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(controls()).queryByRole('alert')).not.toBeInTheDocument()
    expect(buttons()).toEqual(['Mark blocked', 'Mark resolved'])
  })

  it('cancels the reason box with Escape', async () => {
    const user = renderWith('in_progress')
    await heading()

    await user.click(within(controls()).getByRole('button', { name: 'Mark blocked' }))
    await user.keyboard('{Escape}')

    expect(within(controls()).queryByRole('textbox')).not.toBeInTheDocument()
    expect(changeTicketStatus).not.toHaveBeenCalled()
  })

  it('shows a refused one-click move as a message, never a raw error', async () => {
    vi.mocked(changeTicketStatus).mockRejectedValue(new TypeError('boom'))
    const user = renderWith('blocked')
    await heading()

    await user.click(within(controls()).getByRole('button', { name: 'Resume work' }))

    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument()
    expect(screen.queryByText(/boom/)).not.toBeInTheDocument()
  })

  it('disables the buttons while saving', async () => {
    let finish
    vi.mocked(changeTicketStatus).mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const user = renderWith('resolved')
    await heading()

    await user.click(within(controls()).getByRole('button', { name: 'Reopen' }))

    expect(within(controls()).getByRole('button', { name: 'Reopen' })).toBeDisabled()
    finish({ ...TICKET, status: 'in_progress' })
    expect(await screen.findByText('Status changed to In Progress.')).toBeInTheDocument()
  })
})
