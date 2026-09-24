import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../App'
import { ApiError } from '../services/apiClient'
import { addNote, getMyTicket, listMyTickets, listNotes, listStatusHistory } from '../services/ticketService'
import { makeTicket, TICKETS } from '../test/fixtures'
import { JANE, renderWithProviders } from '../test/renderWithProviders'

vi.mock('../services/ticketService', () => ({
  listMyTickets: vi.fn(),
  getMyTicket: vi.fn(),
  listNotes: vi.fn(),
  listStatusHistory: vi.fn(),
  addNote: vi.fn(),
}))

/** Serve TICKETS like the API would for the given filters. */
function fakeApi(filters = {}) {
  let result = TICKETS
  if (filters.view === 'active') result = result.filter((t) => t.status !== 'closed')
  if (filters.status) result = result.filter((t) => t.status === filters.status)
  if (filters.q) result = result.filter((t) => t.title.toLowerCase().includes(filters.q.toLowerCase()))
  return Promise.resolve(result)
}

/** GET /tickets/:id for a list ticket: the list fields plus engineer and blocked reason. */
const detailOf = (ticket, extra = {}) => ({ ...ticket, assigned_to_name: 'Sam Tech', blocked_reason: null, ...extra })

const NOTE = {
  note_id: 1,
  ticket_id: 5,
  user_id: 4,
  author_name: 'Sam Tech',
  author_role: 'engineer',
  note_text: 'New toner is on the way.',
  created_at: '2026-09-22T12:00:00-04:00',
}

function renderDashboard({ width = 1280 } = {}) {
  const user = userEvent.setup()
  renderWithProviders(<App />, { route: '/dashboard', user: JANE, width })
  return user
}

const table = () => screen.getByRole('table', { name: 'My tickets' })
/** The "#5" links in the table, one per row, in order. */
const rowIds = () => within(table()).getAllByRole('link').map((link) => link.textContent)
const lastFilters = () => vi.mocked(listMyTickets).mock.calls.at(-1)[0]
const tiles = () => screen.getByRole('list', { name: 'My tickets in numbers' })
const tile = (name) => within(tiles()).getByRole('button', { name: new RegExp(`^${name}`) })
const highlight = () => screen.findByRole('region', { name: '#5 Printer jam' })

beforeEach(() => {
  vi.mocked(listMyTickets).mockReset().mockImplementation(fakeApi)
  vi.mocked(getMyTicket)
    .mockReset()
    .mockImplementation(({ ticketId }) => Promise.resolve(detailOf(TICKETS.find((t) => t.ticket_id === Number(ticketId)))))
  vi.mocked(listNotes).mockReset().mockResolvedValue([NOTE])
  vi.mocked(addNote).mockReset().mockResolvedValue({})
})

describe('DashboardPage: overview', () => {
  it('greets the user and links to the create-ticket form', async () => {
    renderDashboard()
    expect(screen.getByRole('heading', { level: 1, name: 'My dashboard' })).toBeInTheDocument()
    expect(screen.getByText('Welcome back, Jane.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create New Ticket' })).toHaveAttribute('href', '/tickets/new')
    await screen.findByRole('table')
  })

  it('shows placeholders while the first load is in flight', () => {
    vi.mocked(listMyTickets).mockReturnValue(new Promise(() => {}))
    renderDashboard()
    expect(screen.getByLabelText('Loading your tickets')).toHaveAttribute('aria-busy', 'true')
  })

  it('counts active tickets and each active status', async () => {
    renderDashboard()
    await screen.findByRole('table')
    const counts = within(tiles()).getAllByRole('listitem').map((li) => li.textContent)
    expect(counts).toEqual([
      'Active3not yet closed',
      'Open1not started yet',
      'In Progress1being fixed',
      'Blocked1waiting on something',
      'Resolved0fixed, pending close',
    ])
  })

  it('highlights the most recent active ticket with its engineer and latest note', async () => {
    renderDashboard()
    const card = await highlight()
    expect(within(card).getByText('MOST RECENT ACTIVE')).toBeInTheDocument()
    expect(within(card).getByText('MOST RECENT ACTIVE').parentElement).toHaveTextContent('In Progress')
    expect(within(card).getByText('Building A · Floor 2 · My floor')).toBeInTheDocument()
    expect(await within(card).findByText('Engineer: Sam Tech')).toBeInTheDocument()
    expect(await within(card).findByText('New toner is on the way.')).toBeInTheDocument()
    expect(within(card).getByRole('figure', { name: 'Latest note' })).toHaveTextContent(/^Sam Tech · Engineer · /)
    expect(within(card).getByRole('link', { name: 'View ticket' })).toHaveAttribute('href', '/tickets/5')
    expect(getMyTicket).toHaveBeenCalledWith({ ticketId: 5 }, expect.anything())
    expect(listNotes).toHaveBeenCalledWith({ ticketId: 5 }, expect.anything())
  })

  it('shows where the ticket is in the workflow, without dates', async () => {
    renderDashboard()
    const steps = within(await highlight()).getByRole('list', { name: 'Ticket workflow' })
    expect(within(steps).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Open (done)',
      'In Progress (current status)',
      'Resolved (not reached yet)',
      'Closed (not reached yet)',
    ])
    expect(within(steps).getByText(/In Progress/).closest('li')).toHaveAttribute('aria-current', 'step')
  })

  it('shows a blocked ticket as paused, with the reason next to "Blocked"', async () => {
    const blocked = makeTicket({ ticket_id: 4, title: 'Lobby doors', status: 'blocked' })
    vi.mocked(listMyTickets).mockResolvedValue([blocked])
    vi.mocked(getMyTicket).mockResolvedValue(detailOf(blocked, { blocked_reason: 'Waiting on a vendor part' }))
    renderDashboard()

    const card = await screen.findByRole('region', { name: '#4 Lobby doors' })
    const steps = within(card).getAllByRole('listitem')
    expect(steps[1]).toHaveTextContent('In Progress (paused while blocked)')
    expect(steps[1]).toHaveAttribute('aria-current', 'step')
    expect(await within(card).findByText(/: Waiting on a vendor part$/)).toHaveTextContent(
      'Blocked: Waiting on a vendor part',
    )
  })

  it('says who is waiting when no engineer is assigned, and when there are no notes', async () => {
    vi.mocked(getMyTicket).mockResolvedValue(detailOf(TICKETS[0], { assigned_to_name: null }))
    vi.mocked(listNotes).mockResolvedValue([])
    renderDashboard()
    const card = await highlight()
    expect(await within(card).findByText('Waiting for an engineer')).toBeInTheDocument()
    expect(await within(card).findByText(/^No notes yet\./)).toBeInTheDocument()
  })

  it('calls the employee\'s own note "You"', async () => {
    vi.mocked(listNotes).mockResolvedValue([{ ...NOTE, user_id: JANE.user_id, author_name: 'Jane Doe', author_role: 'employee' }])
    renderDashboard()
    const note = await within(await highlight()).findByRole('figure', { name: 'Latest note' })
    expect(note).toHaveTextContent(/^You · Employee · /)
  })

  it('offers a retry when the latest note fails to load', async () => {
    vi.mocked(listNotes).mockRejectedValueOnce(new ApiError('Server error', { status: 500 }))
    const user = renderDashboard()
    const card = await highlight()
    await user.click(await within(card).findByRole('button', { name: 'Try again' }))
    expect(await within(card).findByText('New toner is on the way.')).toBeInTheDocument()
  })

  it('adds a note from the card, then refreshes the note and the lists', async () => {
    const user = renderDashboard()
    const card = await highlight()
    await within(card).findByText('New toner is on the way.')
    const listCalls = vi.mocked(listMyTickets).mock.calls.length
    vi.mocked(listNotes).mockResolvedValue([NOTE, { ...NOTE, note_id: 2, user_id: JANE.user_id, note_text: 'Thanks!' }])

    await user.click(within(card).getByRole('button', { name: 'Add note' }))
    const dialog = screen.getByRole('dialog', { name: 'Add note' })
    await user.type(within(dialog).getByRole('textbox', { name: /Your note/ }), 'Thanks!')
    await user.click(within(dialog).getByRole('button', { name: 'Add note' }))

    expect(addNote).toHaveBeenCalledWith(5, 'Thanks!')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await within(card).findByText('Thanks!')).toBeInTheDocument()
    // Both lists re-fetch: the summary and the filtered table.
    expect(vi.mocked(listMyTickets).mock.calls.length - listCalls).toBe(2)
  })

  it('keeps the note in the dialog when the API refuses it', async () => {
    vi.mocked(addNote).mockRejectedValue(new ApiError('This ticket is closed.', { status: 409 }))
    const user = renderDashboard()
    await user.click(within(await highlight()).getByRole('button', { name: 'Add note' }))
    const dialog = screen.getByRole('dialog', { name: 'Add note' })
    await user.type(within(dialog).getByRole('textbox', { name: /Your note/ }), 'Still broken')
    await user.click(within(dialog).getByRole('button', { name: 'Add note' }))

    expect(await within(dialog).findByText('This ticket is closed.')).toBeInTheDocument()
    expect(within(dialog).getByRole('textbox', { name: /Your note/ })).toHaveValue('Still broken')

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(addNote).toHaveBeenCalledTimes(1)
  })

  it('lists recent updates on every ticket, newest first, in plain words', async () => {
    renderDashboard()
    const updates = await screen.findByRole('region', { name: 'Recent updates' })
    const lines = within(updates).getAllByRole('listitem').map((li) => li.textContent)
    expect(lines).toHaveLength(4)
    expect(lines[0]).toMatch(/^#5 Printer jam is being worked on\./)
    expect(lines[1]).toMatch(/^#2 Old lamp was closed\./)
    expect(lines[2]).toMatch(/^#4 Lobby doors is blocked, waiting on something\./)
    expect(lines[3]).toMatch(/^#1 Wi-Fi keeps dropping was received\. Work hasn't started yet\./)
    expect(within(updates).getByRole('link', { name: '#1' })).toHaveAttribute('href', '/tickets/1')
  })

  it('never shows priority to an employee', async () => {
    renderDashboard()
    await within(await highlight()).findByText('New toner is on the way.')
    expect(document.body).not.toHaveTextContent(/priority|\bP[123]\b/i)
  })

  it('says so when nothing is active', async () => {
    vi.mocked(listMyTickets).mockImplementation(() => Promise.resolve([TICKETS[1]]))
    renderDashboard()
    expect(await screen.findByRole('heading', { name: 'No active tickets' })).toBeInTheDocument()
    expect(getMyTicket).not.toHaveBeenCalled()
  })

  it('has a friendly empty state for a new employee', async () => {
    vi.mocked(listMyTickets).mockResolvedValue([])
    renderDashboard()
    expect(
      await screen.findByRole('heading', { name: "You haven't reported any issues yet" }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'My tickets' })).not.toBeInTheDocument()
  })

  it('explains a failed load and retries', async () => {
    vi.mocked(listMyTickets)
      .mockRejectedValueOnce(new ApiError("Can't reach the server. Check your connection and try again.", { status: 0 }))
      .mockImplementation(fakeApi)
    const user = renderDashboard()

    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server.")
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('list', { name: 'My tickets in numbers' })).toBeInTheDocument()
  })
})

describe('DashboardPage: my tickets list', () => {
  it('starts on active tickets, newest update first', async () => {
    renderDashboard()
    await screen.findByRole('table')
    expect(rowIds()).toEqual(['#5', '#4', '#1'])
    expect(lastFilters()).toEqual({ view: 'active' })
    expect(screen.getByText('Active and awaiting close')).toBeInTheDocument()
    const firstRow = within(table()).getAllByRole('row')[1]
    expect(firstRow).toHaveTextContent('Printer jam')
    expect(firstRow).toHaveTextContent('Building A · Floor 2')
    expect(firstRow).toHaveTextContent('In Progress')
    expect(firstRow).toHaveTextContent('My floor')
    expect(firstRow).toHaveTextContent('Printer / Peripheral')
  })

  it('switches between active and all', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'All' }))
    await waitFor(() => expect(rowIds()).toHaveLength(4))
    expect(lastFilters()).toEqual({})
    expect(screen.getByText('All tickets')).toBeInTheDocument()

    // Clicking the selected option again keeps it selected.
    await user.click(screen.getByRole('button', { name: 'All' }))
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Active' }))
    await waitFor(() => expect(rowIds()).toHaveLength(3))
    expect(lastFilters()).toEqual({ view: 'active' })
  })

  it('filters to a status from its count, and clicking it again clears the filter', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')

    await user.click(tile('Blocked'))
    await waitFor(() => expect(rowIds()).toEqual(['#4']))
    expect(lastFilters()).toEqual({ status: 'blocked' })
    expect(tile('Blocked')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('1 shown')).toBeInTheDocument()
    // Neither Active nor All is lit while a count filters the list.
    expect(screen.getByRole('button', { name: 'Active' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false')

    await user.click(tile('Blocked'))
    await waitFor(() => expect(rowIds()).toHaveLength(3))
    expect(lastFilters()).toEqual({ view: 'active' })
    expect(tile('Blocked')).toHaveAttribute('aria-pressed', 'false')
  })

  it('clears a status filter from its chip', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')
    await user.click(tile('Open'))
    await waitFor(() => expect(rowIds()).toEqual(['#1']))

    await user.click(screen.getByRole('button', { name: 'Clear the Open filter' }))
    await waitFor(() => expect(rowIds()).toHaveLength(3))
    expect(screen.queryByRole('button', { name: 'Clear the Open filter' })).not.toBeInTheDocument()
  })

  it('goes back to active tickets from the Active count', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: 'All' }))
    await user.click(tile('In Progress'))
    await waitFor(() => expect(lastFilters()).toEqual({ status: 'in_progress' }))

    await user.click(tile('Active'))
    await waitFor(() => expect(rowIds()).toEqual(['#5', '#4', '#1']))
    expect(lastFilters()).toEqual({ view: 'active' })
    expect(tile('Active')).not.toHaveAttribute('aria-pressed')
  })

  it('filters by any status from the dropdown, closed included', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')

    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    await user.click(screen.getByRole('option', { name: 'Closed' }))
    await waitFor(() => expect(rowIds()).toEqual(['#2']))
    expect(lastFilters()).toEqual({ status: 'closed' })
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Status: Closed')

    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    await user.click(screen.getByRole('option', { name: 'All statuses' }))
    await waitFor(() => expect(rowIds()).toHaveLength(3))
  })

  it('searches once typing pauses', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')
    const callsBefore = vi.mocked(listMyTickets).mock.calls.length

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'printer')

    // Generous timeout: under a full parallel run the 300 ms debounce can take a while to land.
    await waitFor(() => expect(rowIds()).toEqual(['#5']), { timeout: 3000 })
    // One search request for the whole word, not one per letter.
    expect(vi.mocked(listMyTickets).mock.calls.length - callsBefore).toBe(1)
    expect(lastFilters()).toEqual({ view: 'active', q: 'printer' })
  })

  it('offers to clear filters when nothing matches', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'zzz')
    expect(await screen.findByText('No tickets match these filters.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(rowIds()).toHaveLength(3))
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('')
  })

  it('shows progress over the old rows while refreshing', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')
    vi.mocked(listMyTickets).mockReturnValue(new Promise(() => {}))

    await user.click(screen.getByRole('button', { name: 'All' }))

    expect(await screen.findByRole('progressbar', { name: 'Updating tickets' })).toBeInTheDocument()
    expect(rowIds()).toHaveLength(3)
  })

  it('shows a list error with retry, without losing the overview', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')
    vi.mocked(listMyTickets).mockRejectedValueOnce(
      new ApiError('Something went wrong on our side. Please try again.', { status: 500 }),
    )

    await user.click(tile('Blocked'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on our side.')
    expect(screen.getByRole('list', { name: 'My tickets in numbers' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(rowIds()).toEqual(['#4']))
  })

  it('opens a ticket when its row is clicked', async () => {
    vi.mocked(listNotes).mockResolvedValue([])
    vi.mocked(listStatusHistory).mockResolvedValue([])
    const user = renderDashboard()
    await screen.findByRole('table')

    await user.click(within(table()).getByText('Lobby doors'))

    expect(await screen.findByRole('heading', { level: 1, name: '#4 Lobby doors' })).toBeInTheDocument()
  })
})

describe('DashboardPage: on a phone', () => {
  it('uses cards instead of a table, with the Create button pinned', async () => {
    renderDashboard({ width: 375 })
    const section = await screen.findByRole('region', { name: 'My tickets' })
    await waitFor(() => expect(within(section).getAllByRole('listitem')).toHaveLength(3))
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    const first = within(section).getAllByRole('link')[0]
    expect(first).toHaveAttribute('href', '/tickets/5')
    expect(first).toHaveTextContent(/^#5In Progress.*Printer jamBuilding A · Floor 2 · My floor$/)
    expect(screen.getAllByRole('link', { name: 'Create New Ticket' })).toHaveLength(1)
  })

  it('shows the most recent ticket compactly, without the updates feed', async () => {
    renderDashboard({ width: 375 })
    const card = await highlight()
    expect(await within(card).findByText('New toner is on the way.')).toBeInTheDocument()
    expect(within(card).getByRole('list', { name: 'Ticket workflow' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Add note' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /Recent updates/ })).not.toBeInTheDocument()
  })
})
