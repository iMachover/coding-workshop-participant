import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../App'
import { ApiError } from '../services/apiClient'
import {
  addAssignedTicketNote,
  changeTicketStatus,
  getAssignedTicket,
  listMyQueue,
} from '../services/engineerTicketService'
import { listBuildings } from '../services/locationService'
import { QUEUE } from '../test/fixtures'
import { renderWithProviders, SAM } from '../test/renderWithProviders'

vi.mock('../services/engineerTicketService', () => ({
  listMyQueue: vi.fn(),
  changeTicketStatus: vi.fn(),
  getAssignedTicket: vi.fn(),
  addAssignedTicketNote: vi.fn(),
  // The ticket page, for opening a row.
  listAssignedTicketHistory: vi.fn(() => Promise.resolve([])),
  listAssignedTicketNotes: vi.fn(() => Promise.resolve([])),
}))
vi.mock('../services/locationService', () => ({ listBuildings: vi.fn() }))

const CLOSED = { ...QUEUE[0], ticket_id: 3, title: 'Old lamp', status: 'closed', priority: 'P3' }
// Resolved, so it waits for an admin: in the Resolved count but not "P1 active".
const RESOLVED_P1 = { ...QUEUE[0], ticket_id: 13, title: 'Fire door alarm', status: 'resolved', priority: 'P1' }
const ALL = [QUEUE[0], CLOSED, ...QUEUE.slice(1), RESOLVED_P1]

/** Serve Sam's tickets like the API would for the given filters (already in triage order). */
function fakeApi(filters = {}, tickets = ALL) {
  let result = [...tickets]
  if (filters.view === 'active') result = result.filter((t) => t.status !== 'closed')
  if (filters.view === 'closed') result = result.filter((t) => t.status === 'closed')
  if (filters.status) result = result.filter((t) => t.status === filters.status)
  if (filters.priority) result = result.filter((t) => t.priority === filters.priority)
  if (filters.building_id) result = result.filter((t) => t.building_id === Number(filters.building_id))
  if (filters.q) result = result.filter((t) => t.title.toLowerCase().includes(filters.q.toLowerCase()))
  return Promise.resolve(result)
}

const nothingInProgress = (filters) => fakeApi(filters, ALL.filter((t) => t.status !== 'in_progress'))

function renderDashboard({ width = 1280 } = {}) {
  const user = userEvent.setup()
  renderWithProviders(<App />, { route: '/engineer', user: SAM, width })
  return user
}

const table = () => screen.getByRole('table', { name: 'My tickets' })
const rowTitles = () =>
  within(table())
    .getAllByRole('row')
    .slice(1)
    // The title itself, without the Escalated icon's hidden text.
    .map((row) => within(row).getAllByRole('cell')[1].firstChild.firstChild.textContent)
const SUMMARY_FILTERS = { view: 'active' }
// The summary always asks for the active queue; the list's first call is the same, later ones differ.
const lastListFilters = () => vi.mocked(listMyQueue).mock.calls.at(-1)[0]
const workingOn = () => screen.findByRole('region', { name: 'WORKING ON NOW' })
const upNext = () => screen.findByRole('region', { name: 'Up next' })
const tile = (name) => screen.getByRole('button', { name: new RegExp(`^${name}\\s*\\d`) })

async function choose(user, label, option) {
  await user.click(screen.getByRole('combobox', { name: label }))
  await user.click(screen.getByRole('option', { name: option }))
}

beforeEach(() => {
  vi.mocked(listMyQueue).mockReset().mockImplementation((filters) => fakeApi(filters))
  vi.mocked(changeTicketStatus).mockReset()
  vi.mocked(addAssignedTicketNote).mockReset()
  vi.mocked(getAssignedTicket)
    .mockReset()
    .mockImplementation(({ ticketId }) =>
      Promise.resolve({ ...ALL.find((t) => t.ticket_id === Number(ticketId)), description: `Details of #${ticketId}.` }),
    )
  vi.mocked(listBuildings).mockReset().mockResolvedValue([
    { building_id: 1, building_name: 'Building A' },
    { building_id: 2, building_name: 'Building B' },
  ])
})

describe('EngineerDashboardPage: summary', () => {
  it('greets the engineer', async () => {
    renderDashboard()
    expect(screen.getByRole('heading', { level: 1, name: 'My queue' })).toBeInTheDocument()
    expect(screen.getByText(/^Welcome back, Sam\./)).toBeInTheDocument()
    expect(listMyQueue).toHaveBeenCalledWith(SUMMARY_FILTERS, expect.anything())
    await screen.findByRole('table')
  })

  it('shows the ticket in progress that was touched most recently, with its description', async () => {
    renderDashboard()
    const card = await workingOn()

    expect(within(card).getByRole('link', { name: 'Wi-Fi keeps dropping' })).toHaveAttribute('href', '/engineer/tickets/9')
    expect(card).toHaveTextContent('#9')
    expect(within(card).getByLabelText('Priority P3: One person')).toBeInTheDocument()
    expect(within(card).getByText('In Progress')).toBeInTheDocument()
    expect(within(card).getByRole('img', { name: 'Escalated' })).toBeInTheDocument()
    expect(card).toHaveTextContent('Building A · Floor 3 · Seat 301 · reported by Jane Doe')
    expect(within(card).getByText(/^updated \d+ (min|h|d) ago$/)).toBeInTheDocument()
    expect(await within(card).findByText('Details of #9.')).toBeInTheDocument()
    expect(getAssignedTicket).toHaveBeenCalledWith({ ticketId: 9 }, expect.anything())
  })

  it('says "just now" for a ticket touched in the last minute', async () => {
    vi.mocked(listMyQueue).mockResolvedValue([{ ...QUEUE[1], updated_at: new Date().toISOString() }])
    renderDashboard()
    expect(within(await workingOn()).getByText('updated just now')).toBeInTheDocument()
  })

  it('leaves the description out if it fails to load', async () => {
    vi.mocked(getAssignedTicket).mockRejectedValue(new ApiError('Ticket not found', { status: 404 }))
    renderDashboard()
    const card = await workingOn()
    await waitFor(() => expect(within(card).queryByLabelText('Loading the description')).not.toBeInTheDocument())
    expect(card).not.toHaveTextContent('Details of')
  })

  it('prompts to start the next ticket when nothing is in progress', async () => {
    vi.mocked(listMyQueue).mockImplementation(nothingInProgress)
    renderDashboard()
    const prompt = await screen.findByRole('region', { name: 'Working on now' })
    expect(prompt).toHaveTextContent('Nothing in progress. Start the next ticket below.')
    expect(screen.queryByRole('region', { name: 'WORKING ON NOW' })).not.toBeInTheDocument()
  })

  it('lists the open tickets up next, in triage order', async () => {
    vi.mocked(listMyQueue).mockImplementation((filters) =>
      fakeApi(filters, [QUEUE[0], { ...QUEUE[3], ticket_id: 15, title: 'Loose tile', status: 'open', escalation_requested: true }, ...QUEUE.slice(1)]),
    )
    renderDashboard()
    const next = await upNext()

    expect(next).toHaveTextContent('2 to start · P1 first, then oldest')
    const items = within(next).getAllByRole('listitem')
    expect(items.map((li) => within(li).getAllByRole('link')[0].textContent)).toEqual(['#7', '#15'])
    expect(within(items[0]).getByLabelText('Priority P1: Building-wide')).toBeInTheDocument()
    expect(items[0]).toHaveTextContent('Building B · ')
    expect(within(items[1]).getByRole('img', { name: 'Escalated' })).toBeInTheDocument()
  })

  it('says when there is nothing to work on', async () => {
    vi.mocked(listMyQueue).mockResolvedValue([])
    renderDashboard()
    expect(await upNext()).toHaveTextContent('Nothing waiting. Nice work.')
    expect(screen.getByRole('region', { name: 'Working on now' })).toBeInTheDocument()
    expect(screen.getByText('No tickets are assigned to you right now.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
  })

  it('counts the active queue', async () => {
    renderDashboard()
    const tiles = await screen.findByRole('list', { name: 'My queue in numbers' })
    expect(within(tiles).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'To start1assigned, not started',
      'In Progress2on the go',
      'Blocked1waiting',
      'P1 active1critical',
      'Resolved1awaiting admin close',
    ])
  })

  it('shows placeholders while loading', () => {
    vi.mocked(listMyQueue).mockReturnValue(new Promise(() => {}))
    renderDashboard()
    expect(screen.getByLabelText('Loading your queue')).toHaveAttribute('aria-busy', 'true')
  })

  it('explains a failed load and retries', async () => {
    vi.mocked(listMyQueue)
      .mockRejectedValueOnce(new ApiError("Can't reach the server. Check your connection and try again.", { status: 0 }))
      .mockImplementation((filters) => fakeApi(filters))
    const user = renderDashboard()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Can't reach the server.")
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await workingOn()).toBeInTheDocument()
  })
})

describe('EngineerDashboardPage: count tiles', () => {
  it('filters the list by a status count, and a second click clears it', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')

    await user.click(tile('Blocked'))
    await waitFor(() => expect(rowTitles()).toEqual(['Door sticks']))
    // A status replaces the Active/All view, which is then not lit.
    expect(lastListFilters()).toEqual({ status: 'blocked' })
    expect(tile('Blocked')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('1 shown')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Active' })).toHaveAttribute('aria-pressed', 'false')

    await user.click(tile('Blocked'))
    await waitFor(() => expect(rowTitles()).toHaveLength(5))
    expect(tile('Blocked')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('In triage order')).toBeInTheDocument()
  })

  it('shows only unfinished P1s for "P1 active", with a chip to clear it', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')

    await user.click(tile('P1 active'))
    await waitFor(() => expect(lastListFilters()).toEqual({ view: 'active', priority: 'P1' }))
    // The API also sends the resolved P1; the page leaves it out to match the count.
    await waitFor(() => expect(rowTitles()).toEqual(['Lobby lights out']))

    await user.click(screen.getByRole('button', { name: 'Clear the P1 active filter' }))
    await waitFor(() => expect(rowTitles()).toHaveLength(5))
    expect(lastListFilters()).toEqual({ view: 'active' })
  })

  it('lets go of a count when a dropdown takes over', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')

    await user.click(tile('Resolved'))
    await waitFor(() => expect(rowTitles()).toEqual(['Fire door alarm']))
    await choose(user, 'Status', 'Open')
    await waitFor(() => expect(rowTitles()).toEqual(['Lobby lights out']))
    expect(tile('Resolved')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: /^Clear the/ })).not.toBeInTheDocument()
  })

  it('picking a view clears a count', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')

    await user.click(tile('P1 active'))
    await waitFor(() => expect(rowTitles()).toEqual(['Lobby lights out']))
    await user.click(screen.getByRole('button', { name: 'All' }))
    await waitFor(() => expect(rowTitles()).toHaveLength(6))
    expect(lastListFilters()).toEqual({})
    expect(tile('P1 active')).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('EngineerDashboardPage: my tickets', () => {
  it('starts on active tickets in triage order, the current one highlighted', async () => {
    renderDashboard()
    await screen.findByRole('table')

    expect(rowTitles()).toEqual(['Lobby lights out', 'Printer jam', 'Wi-Fi keeps dropping', 'Door sticks', 'Fire door alarm'])
    expect(lastListFilters()).toEqual({ view: 'active' })
    const headers = within(table()).getAllByRole('columnheader').map((th) => th.textContent)
    expect(headers).toEqual(['#', 'Title · location', 'Category', 'Priority', 'Status', 'Age'])
    expect(within(table()).getByRole('link', { name: '#5' })).toHaveAttribute('href', '/engineer/tickets/5')

    const rows = within(table()).getAllByRole('row').slice(1)
    expect(rows[2]).toHaveAttribute('aria-current', 'true')
    expect(rows[1]).not.toHaveAttribute('aria-current')
    expect(rows[0]).toHaveTextContent('Electrical / Power')
    expect(within(rows[2]).getByRole('img', { name: 'Escalated' })).toBeInTheDocument()
  })

  it('opens a ticket from anywhere on its row', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')
    await user.click(within(table()).getByText('Printer jam'))
    expect(await screen.findByRole('heading', { level: 1, name: /Printer jam/ })).toBeInTheDocument()
  })

  it('filters by status, priority and building', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')

    await choose(user, 'Status', 'Blocked')
    await waitFor(() => expect(rowTitles()).toEqual(['Door sticks']))
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Status: Blocked')

    await choose(user, 'Status', 'All statuses')
    await choose(user, 'Priority', 'P1 · Building-wide')
    await waitFor(() => expect(rowTitles()).toEqual(['Lobby lights out', 'Fire door alarm']))
    expect(screen.getByRole('combobox', { name: 'Priority' })).toHaveTextContent('Priority: P1')

    await choose(user, 'Priority', 'All priorities')
    await choose(user, 'Building', 'Building B')
    await waitFor(() => expect(rowTitles()).toEqual(['Lobby lights out', 'Fire door alarm']))
    expect(lastListFilters()).toEqual({ view: 'active', building_id: '2' })
  })

  it('switches between active and all', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')
    expect(screen.queryByRole('button', { name: 'Closed' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'All' }))
    await waitFor(() => expect(rowTitles()).toHaveLength(6))
    expect(lastListFilters()).toEqual({})
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('searches once typing pauses', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'printer')

    await waitFor(() => expect(rowTitles()).toEqual(['Printer jam']), { timeout: 3000 })
    expect(lastListFilters()).toEqual({ view: 'active', q: 'printer' })
  })

  it('offers to clear filters when nothing matches', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'zzz')
    expect(await screen.findByText('No tickets match these filters.', {}, { timeout: 3000 })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(rowTitles()).toHaveLength(5), { timeout: 3000 })
  })

  it('explains a failed list load and retries', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')
    vi.mocked(listMyQueue).mockRejectedValueOnce(new ApiError('Server error', { status: 500 }))

    await choose(user, 'Status', 'Blocked')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Server error')
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(rowTitles()).toEqual(['Door sticks']))
  })
})

describe('EngineerDashboardPage: phones', () => {
  it('stacks cards with the current ticket first and hides filters behind a button', async () => {
    const user = renderDashboard({ width: 375 })
    const card = await workingOn()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Add note for requester' })).toBeInTheDocument()
    // The description stays on the ticket page to keep the card short.
    expect(card).not.toHaveTextContent('Details of')

    const printer = screen.getByText('Printer jam').closest('a')
    expect(printer).toHaveAttribute('href', '/engineer/tickets/5')
    expect(printer).toHaveTextContent('Building A · Floor 2')

    expect(screen.queryByRole('searchbox', { name: 'Search' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Filter' }))
    expect(screen.getByRole('button', { name: 'Filter' })).toHaveAttribute('aria-expanded', 'true')
    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'door')
    await waitFor(() => expect(lastListFilters()).toEqual({ view: 'active', q: 'door' }), { timeout: 3000 })
  })

  it('starts the next ticket from a round play button', async () => {
    vi.mocked(listMyQueue).mockImplementation(nothingInProgress)
    vi.mocked(changeTicketStatus).mockResolvedValue({ ...QUEUE[0], status: 'in_progress' })
    const user = renderDashboard({ width: 375 })
    const next = await upNext()

    await user.click(within(next).getByRole('button', { name: 'Start work on #7' }))
    expect(changeTicketStatus).toHaveBeenCalledWith(7, 'in_progress', '')
  })
})

describe('EngineerDashboardPage: starting work', () => {
  it('starts the up-next ticket, then refreshes the queue', async () => {
    vi.mocked(listMyQueue).mockImplementation(nothingInProgress)
    vi.mocked(changeTicketStatus).mockResolvedValue({ ...QUEUE[0], status: 'in_progress' })
    const user = renderDashboard()
    const next = await upNext()
    const loads = vi.mocked(listMyQueue).mock.calls.length
    vi.mocked(listMyQueue).mockImplementation((filters) =>
      nothingInProgress(filters).then((tickets) =>
        tickets.map((t) => (t.ticket_id === 7 ? { ...t, status: 'in_progress' } : t)),
      ),
    )

    await user.click(within(next).getByRole('button', { name: 'Start work on #7' }))

    expect(changeTicketStatus).toHaveBeenCalledWith(7, 'in_progress', '')
    expect(await screen.findByRole('alert')).toHaveTextContent('Started #7.')
    const card = await workingOn()
    expect(within(card).getByRole('link', { name: 'Lobby lights out' })).toBeInTheDocument()
    expect(await upNext()).toHaveTextContent('Nothing waiting. Nice work.')
    // The summary and the list both reload.
    expect(vi.mocked(listMyQueue).mock.calls.length - loads).toBe(2)
  })

  it('explains a refused start', async () => {
    vi.mocked(listMyQueue).mockImplementation(nothingInProgress)
    vi.mocked(changeTicketStatus)
      .mockRejectedValueOnce(new ApiError('Ticket not found', { status: 404 }))
      .mockRejectedValueOnce(new TypeError('boom'))
    const user = renderDashboard()
    const next = await upNext()

    await user.click(within(next).getByRole('button', { name: 'Start work on #7' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ticket not found')

    await user.click(within(next).getByRole('button', { name: 'Start work on #7' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong. Please try again.'))
  })

  it('disables Start while it saves', async () => {
    vi.mocked(listMyQueue).mockImplementation(nothingInProgress)
    vi.mocked(changeTicketStatus).mockReturnValue(new Promise(() => {}))
    const user = renderDashboard()
    const next = await upNext()

    await user.click(within(next).getByRole('button', { name: 'Start work on #7' }))

    expect(within(next).getByRole('button', { name: 'Start work on #7' })).toBeDisabled()
  })
})

describe('EngineerDashboardPage: working on now', () => {
  it('offers only the moves allowed from In Progress, plus a note', async () => {
    renderDashboard()
    const card = await workingOn()
    const buttons = within(card).getAllByRole('button').map((b) => b.textContent)
    expect(buttons).toEqual(['Mark resolved…', 'Mark blocked…', 'Add note'])
  })

  it('marks the ticket resolved with what was done', async () => {
    vi.mocked(changeTicketStatus).mockResolvedValue({ ...QUEUE[2], status: 'resolved' })
    const user = renderDashboard()
    const card = await workingOn()
    const loads = vi.mocked(listMyQueue).mock.calls.length

    await user.click(within(card).getByRole('button', { name: 'Mark resolved…' }))
    const dialog = screen.getByRole('dialog', { name: 'Mark as resolved' })
    await user.click(within(dialog).getByRole('button', { name: 'Mark as resolved' }))
    expect(within(dialog).getByText('Write a reason first.')).toBeInTheDocument()
    expect(changeTicketStatus).not.toHaveBeenCalled()

    await user.type(within(dialog).getByRole('textbox', { name: /What did you do/ }), 'Replaced the access point')
    await user.click(within(dialog).getByRole('button', { name: 'Mark as resolved' }))

    expect(changeTicketStatus).toHaveBeenCalledWith(9, 'resolved', 'Replaced the access point')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByRole('alert')).toHaveTextContent('#9 marked resolved. An admin will close it.')
    expect(vi.mocked(listMyQueue).mock.calls.length - loads).toBe(2)
  })

  it('keeps the dialog open with the reason when blocking is refused', async () => {
    vi.mocked(changeTicketStatus).mockRejectedValue(new ApiError('This ticket is already closed', { status: 409 }))
    const user = renderDashboard()
    const card = await workingOn()

    await user.click(within(card).getByRole('button', { name: 'Mark blocked…' }))
    const dialog = screen.getByRole('dialog', { name: 'Mark as blocked' })
    await user.type(within(dialog).getByRole('textbox', { name: /Why is the work paused/ }), 'Waiting on a part')
    await user.click(within(dialog).getByRole('button', { name: 'Mark as blocked' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('This ticket is already closed')
    expect(within(dialog).getByRole('textbox')).toHaveValue('Waiting on a part')
    expect(changeTicketStatus).toHaveBeenCalledWith(9, 'blocked', 'Waiting on a part')

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('adds a note for the requester', async () => {
    vi.mocked(addAssignedTicketNote).mockResolvedValue({})
    const user = renderDashboard()
    const card = await workingOn()

    await user.click(within(card).getByRole('button', { name: 'Add note' }))
    const dialog = screen.getByRole('dialog', { name: 'Add note' })
    expect(dialog).toHaveTextContent('The requester sees it on the ticket.')
    await user.type(within(dialog).getByRole('textbox', { name: /Your note/ }), 'On my way')
    await user.click(within(dialog).getByRole('button', { name: 'Add note' }))

    expect(addAssignedTicketNote).toHaveBeenCalledWith(9, 'On my way')
    expect(await screen.findByRole('alert')).toHaveTextContent('Note added to #9.')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('shows a refused note in the dialog', async () => {
    vi.mocked(addAssignedTicketNote).mockRejectedValue(new TypeError('boom'))
    const user = renderDashboard()
    const card = await workingOn()

    await user.click(within(card).getByRole('button', { name: 'Add note' }))
    const dialog = screen.getByRole('dialog', { name: 'Add note' })
    await user.type(within(dialog).getByRole('textbox'), 'On my way')
    await user.click(within(dialog).getByRole('button', { name: 'Add note' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.')
  })

  it('closes the toast', async () => {
    vi.mocked(addAssignedTicketNote).mockResolvedValue({})
    const user = renderDashboard()
    const card = await workingOn()

    await user.click(within(card).getByRole('button', { name: 'Add note' }))
    await user.type(screen.getByRole('textbox', { name: /Your note/ }), 'On my way')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add note' }))
    const toast = await screen.findByRole('alert')

    await user.click(within(toast).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })
})
