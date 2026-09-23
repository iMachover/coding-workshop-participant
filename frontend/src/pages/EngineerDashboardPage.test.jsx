import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../App'
import { ApiError } from '../services/apiClient'
import { changeTicketStatus, listMyQueue } from '../services/engineerTicketService'
import { listBuildings } from '../services/locationService'
import { QUEUE } from '../test/fixtures'
import { renderWithProviders, SAM } from '../test/renderWithProviders'

vi.mock('../services/engineerTicketService', () => ({ listMyQueue: vi.fn(), changeTicketStatus: vi.fn() }))
vi.mock('../services/locationService', () => ({ listBuildings: vi.fn() }))

const CLOSED = { ...QUEUE[0], ticket_id: 3, title: 'Old lamp', status: 'closed', priority: 'P3' }

/** Serve Sam's tickets like the API would for the given filters (already in triage order). */
function fakeApi(filters = {}) {
  let result = [...QUEUE.slice(0, 1), CLOSED, ...QUEUE.slice(1)]
  if (filters.view === 'active') result = result.filter((t) => t.status !== 'closed')
  if (filters.view === 'closed') result = result.filter((t) => t.status === 'closed')
  if (filters.status) result = result.filter((t) => t.status === filters.status)
  if (filters.priority) result = result.filter((t) => t.priority === filters.priority)
  if (filters.building_id) result = result.filter((t) => t.building_id === Number(filters.building_id))
  if (filters.q) result = result.filter((t) => t.title.toLowerCase().includes(filters.q.toLowerCase()))
  return Promise.resolve(result)
}

function renderDashboard({ width = 1280 } = {}) {
  const user = userEvent.setup()
  renderWithProviders(<App />, { route: '/engineer', user: SAM, width })
  return user
}

const table = () => screen.getByRole('table', { name: 'My tickets' })
const rowTitles = () =>
  within(table()).getAllByRole('row').slice(1).map((row) => within(row).getByRole('link').textContent)
const SUMMARY_FILTERS = { view: 'active' }
// The summary always asks for the active queue; the list's first call is the same, later ones differ.
const lastListFilters = () => vi.mocked(listMyQueue).mock.calls.at(-1)[0]
const current = () => screen.getByRole('region', { name: /Current ticket|Up next|Nothing to work on/ })

async function choose(user, label, option) {
  await user.click(screen.getByRole('combobox', { name: label }))
  await user.click(screen.getByRole('option', { name: option }))
}

beforeEach(() => {
  vi.mocked(listMyQueue).mockReset().mockImplementation(fakeApi)
  vi.mocked(changeTicketStatus).mockReset()
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

  it('highlights the ticket in progress that was touched most recently', async () => {
    renderDashboard()
    const card = await screen.findByRole('region', { name: 'Current ticket' })

    expect(card).toHaveTextContent('#9 Wi-Fi keeps dropping')
    expect(within(card).getByLabelText('Priority P3: One person')).toBeInTheDocument()
    expect(within(card).getByText('In Progress')).toBeInTheDocument()
    expect(within(card).getByText('Escalated')).toBeInTheDocument()
    expect(card).toHaveTextContent('Building A · Floor 3 · Seat 301 · Jane Doe')
    expect(within(card).getByText(/^Updated \d+ (min|h|d) ago$/)).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Open ticket' })).toHaveAttribute('href', '/engineer/tickets/9')
  })

  it('says "just now" for a ticket touched in the last minute', async () => {
    vi.mocked(listMyQueue).mockResolvedValue([{ ...QUEUE[1], updated_at: new Date().toISOString() }])
    renderDashboard()
    const card = await screen.findByRole('region', { name: 'Current ticket' })
    expect(within(card).getByText('Updated just now')).toBeInTheDocument()
  })

  it('suggests the top open ticket when nothing is in progress', async () => {
    vi.mocked(listMyQueue).mockImplementation((filters) =>
      fakeApi(filters).then((tickets) => tickets.filter((t) => t.status !== 'in_progress')),
    )
    renderDashboard()
    const card = await screen.findByRole('region', { name: 'Up next' })
    expect(card).toHaveTextContent('#7 Lobby lights out')
    expect(within(card).getByLabelText('Priority P1: Building-wide')).toBeInTheDocument()
  })

  it('says when there is nothing to work on', async () => {
    vi.mocked(listMyQueue).mockResolvedValue([])
    renderDashboard()
    expect(await screen.findByRole('heading', { name: 'Nothing to work on right now' })).toBeInTheDocument()
    expect(current()).toHaveTextContent('New tickets appear here when an admin assigns them to you.')
  })

  it('counts open, in progress, blocked and P1 tickets', async () => {
    renderDashboard()
    const tiles = await screen.findByRole('list', { name: 'My queue in numbers' })
    expect(within(tiles).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Open1',
      'In Progress2',
      'Blocked1',
      'P1 to finish1',
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
      .mockImplementation(fakeApi)
    const user = renderDashboard()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Can't reach the server.")
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('region', { name: 'Current ticket' })).toBeInTheDocument()
  })
})

describe('EngineerDashboardPage: my tickets', () => {
  it('starts on active tickets in triage order, without an Engineer column', async () => {
    renderDashboard()
    await screen.findByRole('table')

    expect(rowTitles()).toEqual(['Lobby lights out', 'Printer jam', 'Wi-Fi keeps dropping', 'Door sticks'])
    expect(lastListFilters()).toEqual({ view: 'active' })
    const headers = within(table()).getAllByRole('columnheader').map((th) => th.textContent)
    expect(headers).toEqual(['Priority', '#', 'Title', 'Status', 'Requester', 'Location', 'Opened'])
    expect(within(table()).getByRole('link', { name: 'Printer jam' })).toHaveAttribute('href', '/engineer/tickets/5')
  })

  it('filters by status, priority and building', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')

    await choose(user, 'Status', 'Blocked')
    await waitFor(() => expect(rowTitles()).toEqual(['Door sticks']))

    await choose(user, 'Status', 'All statuses')
    await choose(user, 'Priority', 'P1 · Building-wide')
    await waitFor(() => expect(rowTitles()).toEqual(['Lobby lights out']))

    await choose(user, 'Priority', 'All priorities')
    await choose(user, 'Building', 'Building B')
    await waitFor(() => expect(rowTitles()).toEqual(['Lobby lights out']))
    expect(lastListFilters()).toEqual({ view: 'active', building_id: '2' })
  })

  it('switches between active, closed and all', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Closed' }))
    await waitFor(() => expect(rowTitles()).toEqual(['Old lamp']))
    expect(lastListFilters()).toEqual({ view: 'closed' })

    await user.click(screen.getByRole('button', { name: 'All' }))
    await waitFor(() => expect(rowTitles()).toHaveLength(5))
    expect(lastListFilters()).toEqual({})
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
    await waitFor(() => expect(rowTitles()).toHaveLength(4), { timeout: 3000 })
  })

  it('shows cards without an engineer line on phones', async () => {
    renderDashboard({ width: 375 })
    const card = (await screen.findByText('#5 Printer jam')).closest('a')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(card).toHaveAttribute('href', '/engineer/tickets/5')
    expect(card).toHaveTextContent(/Opened /)
    expect(card).not.toHaveTextContent('Engineer:')
  })
})

describe('EngineerDashboardPage: starting work', () => {
  const nothingInProgress = (filters) =>
    fakeApi(filters).then((tickets) => tickets.filter((t) => t.status !== 'in_progress'))

  it('starts the up-next ticket from the card, then refreshes the queue', async () => {
    vi.mocked(listMyQueue).mockImplementation(nothingInProgress)
    vi.mocked(changeTicketStatus).mockResolvedValue({ ...QUEUE[0], status: 'in_progress' })
    const user = renderDashboard()
    const card = await screen.findByRole('region', { name: 'Up next' })
    const loads = vi.mocked(listMyQueue).mock.calls.length
    vi.mocked(listMyQueue).mockImplementation((filters) =>
      nothingInProgress(filters).then((tickets) =>
        tickets.map((t) => (t.ticket_id === 7 ? { ...t, status: 'in_progress' } : t)),
      ),
    )

    await user.click(within(card).getByRole('button', { name: 'Start work' }))

    expect(changeTicketStatus).toHaveBeenCalledWith(7, 'in_progress')
    const current = await screen.findByRole('region', { name: 'Current ticket' })
    expect(current).toHaveTextContent('#7 Lobby lights out')
    expect(within(current).queryByRole('button', { name: 'Start work' })).not.toBeInTheDocument()
    // The summary and the list both reload.
    expect(vi.mocked(listMyQueue).mock.calls.length - loads).toBe(2)
  })

  it('explains a refused start on the card', async () => {
    vi.mocked(listMyQueue).mockImplementation(nothingInProgress)
    vi.mocked(changeTicketStatus).mockRejectedValueOnce(new ApiError('Ticket not found', { status: 404 }))
    vi.mocked(changeTicketStatus).mockRejectedValueOnce(new TypeError('boom'))
    const user = renderDashboard()
    const card = await screen.findByRole('region', { name: 'Up next' })

    await user.click(within(card).getByRole('button', { name: 'Start work' }))
    expect(await within(card).findByRole('alert')).toHaveTextContent('Ticket not found')

    await user.click(within(card).getByRole('button', { name: 'Start work' }))
    await waitFor(() =>
      expect(within(card).getByRole('alert')).toHaveTextContent('Something went wrong. Please try again.'),
    )
  })

  it('shows Starting… while it saves', async () => {
    vi.mocked(listMyQueue).mockImplementation(nothingInProgress)
    vi.mocked(changeTicketStatus).mockReturnValue(new Promise(() => {}))
    const user = renderDashboard()
    const card = await screen.findByRole('region', { name: 'Up next' })

    await user.click(within(card).getByRole('button', { name: 'Start work' }))

    expect(within(card).getByRole('button', { name: 'Starting…' })).toBeDisabled()
  })

  it('offers no Start button for the ticket already in progress', async () => {
    renderDashboard()
    const card = await screen.findByRole('region', { name: 'Current ticket' })
    expect(within(card).queryByRole('button', { name: 'Start work' })).not.toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Open ticket' })).toBeInTheDocument()
  })
})
