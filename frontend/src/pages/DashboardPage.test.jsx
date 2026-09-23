import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../App'
import { ApiError } from '../services/apiClient'
import { listMyTickets } from '../services/ticketService'
import { TICKETS } from '../test/fixtures'
import { JANE, renderWithProviders } from '../test/renderWithProviders'

vi.mock('../services/ticketService', () => ({ listMyTickets: vi.fn() }))

/** Serve TICKETS like the API would for the given filters. */
function fakeApi(filters = {}) {
  let result = TICKETS
  if (filters.view === 'active') result = result.filter((t) => t.status !== 'closed')
  if (filters.view === 'closed') result = result.filter((t) => t.status === 'closed')
  if (filters.status) result = result.filter((t) => t.status === filters.status)
  if (filters.urgency) result = result.filter((t) => t.urgency === filters.urgency)
  if (filters.q) result = result.filter((t) => t.title.toLowerCase().includes(filters.q.toLowerCase()))
  return Promise.resolve(result)
}

function renderDashboard({ width = 1280 } = {}) {
  const user = userEvent.setup()
  renderWithProviders(<App />, { route: '/dashboard', user: JANE, width })
  return user
}

const table = () => screen.getByRole('table', { name: 'My tickets' })
const rowTitles = () =>
  within(table()).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[1].textContent)
const lastFilters = () => vi.mocked(listMyTickets).mock.calls.at(-1)[0]

beforeEach(() => {
  vi.mocked(listMyTickets).mockReset()
  vi.mocked(listMyTickets).mockImplementation(fakeApi)
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

  it('highlights the most recent active ticket', async () => {
    renderDashboard()
    const highlight = await screen.findByRole('region', { name: '#5 Printer jam' })
    expect(within(highlight).getByText('Most recent active ticket')).toBeInTheDocument()
    expect(within(highlight).getByText('In Progress')).toBeInTheDocument()
    expect(within(highlight).getByText('High')).toBeInTheDocument()
    expect(within(highlight).getByText('Impact: My floor')).toBeInTheDocument()
    expect(within(highlight).getByText('Printer / Peripheral')).toBeInTheDocument()
    expect(within(highlight).getByText(/^Building A · Floor 2 · Updated/)).toBeInTheDocument()
  })

  it('shows headline counts', async () => {
    renderDashboard()
    const active = (await screen.findByRole('heading', { name: 'Active tickets' })).parentElement
    expect(within(active).getByText('3')).toBeInTheDocument()

    const byStatus = screen.getByRole('heading', { name: 'By status' }).parentElement
    const statusCounts = within(byStatus).getAllByRole('listitem').map((li) => li.textContent)
    expect(statusCounts).toEqual(['Open1', 'In Progress1', 'Blocked1', 'Resolved0', 'Closed1'])

    const byUrgency = screen.getByRole('heading', { name: 'Active by urgency' }).parentElement
    const urgencyCounts = within(byUrgency).getAllByRole('listitem').map((li) => li.textContent)
    expect(urgencyCounts).toEqual(['Low0', 'Medium2', 'High1'])
  })

  it('never shows priority to an employee', async () => {
    renderDashboard()
    await screen.findByRole('table')
    expect(document.body).not.toHaveTextContent(/priority|\bP[123]\b/i)
  })

  it('says so when nothing is active', async () => {
    vi.mocked(listMyTickets).mockImplementation(() => Promise.resolve([TICKETS[1]]))
    renderDashboard()
    expect(await screen.findByRole('heading', { name: 'No active tickets' })).toBeInTheDocument()
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

    expect(await screen.findByRole('heading', { name: 'Active tickets' })).toBeInTheDocument()
  })
})

describe('DashboardPage: my tickets list', () => {
  it('starts on active tickets, newest update first', async () => {
    renderDashboard()
    await screen.findByRole('table')
    expect(rowTitles()).toEqual(['Printer jam', 'Lobby doors', 'Wi-Fi keeps dropping'])
    expect(lastFilters()).toEqual({ view: 'active' })
    const firstRow = within(table()).getAllByRole('row')[1]
    expect(firstRow).toHaveTextContent('5')
    expect(firstRow).toHaveTextContent('In Progress')
    expect(firstRow).toHaveTextContent('High')
    expect(firstRow).toHaveTextContent('My floor')
    expect(firstRow).toHaveTextContent('Building A · Floor 2')
  })

  it('switches between active, closed and all', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Closed' }))
    await waitFor(() => expect(rowTitles()).toEqual(['Old lamp']))
    expect(lastFilters()).toEqual({ view: 'closed' })

    await user.click(screen.getByRole('button', { name: 'All' }))
    await waitFor(() => expect(rowTitles()).toHaveLength(4))
    expect(lastFilters()).toEqual({})

    // Clicking the selected option again keeps it selected.
    await user.click(screen.getByRole('button', { name: 'All' }))
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('filters by status and urgency', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')

    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    await user.click(screen.getByRole('option', { name: 'Blocked' }))
    await waitFor(() => expect(rowTitles()).toEqual(['Lobby doors']))

    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    await user.click(screen.getByRole('option', { name: 'All statuses' }))
    await user.click(screen.getByRole('combobox', { name: 'Urgency' }))
    await user.click(screen.getByRole('option', { name: 'High' }))
    await waitFor(() => expect(rowTitles()).toEqual(['Printer jam']))
    expect(lastFilters()).toEqual({ view: 'active', urgency: 'high' })
  })

  it('searches once typing pauses', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')
    const callsBefore = vi.mocked(listMyTickets).mock.calls.length

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'printer')

    // Generous timeout: under a full parallel run the 300 ms debounce can take a while to land.
    await waitFor(() => expect(rowTitles()).toEqual(['Printer jam']), { timeout: 3000 })
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
    await waitFor(() => expect(rowTitles()).toHaveLength(3))
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('')
  })

  it('shows progress over the old rows while refreshing', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')
    vi.mocked(listMyTickets).mockReturnValue(new Promise(() => {}))

    await user.click(screen.getByRole('button', { name: 'Closed' }))

    expect(await screen.findByRole('progressbar', { name: 'Updating tickets' })).toBeInTheDocument()
    expect(rowTitles()).toHaveLength(3)
  })

  it('shows a list error with retry, without losing the overview', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')
    vi.mocked(listMyTickets).mockRejectedValueOnce(
      new ApiError('Something went wrong on our side. Please try again.', { status: 500 }),
    )

    await user.click(screen.getByRole('button', { name: 'Closed' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on our side.')
    expect(screen.getByRole('heading', { name: 'Active tickets' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(rowTitles()).toEqual(['Old lamp']))
  })

  it('uses cards instead of a table on phones', async () => {
    renderDashboard({ width: 375 })
    const section = (await screen.findByRole('heading', { name: 'My tickets' })).parentElement
    await waitFor(() => expect(within(section).getAllByRole('listitem')).toHaveLength(3))
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(within(section).getAllByRole('listitem')[0]).toHaveTextContent('#5 Printer jam')
  })
})
