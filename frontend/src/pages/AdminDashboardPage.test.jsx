import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../App'
import { getFacilities } from '../services/adminFacilityService'
import { assignTicket, getMetrics, getTicket, listAllTickets } from '../services/adminTicketService'
import { listEngineers } from '../services/adminUserService'
import { ApiError } from '../services/apiClient'
import { ADMIN_TICKETS, ENGINEERS } from '../test/fixtures'
import { ALEX, renderWithProviders } from '../test/renderWithProviders'

vi.mock('../services/adminTicketService', () => ({
  listAllTickets: vi.fn(),
  assignTicket: vi.fn(),
  getMetrics: vi.fn(),
  // Only reached when a test opens a ticket; it stays loading.
  getTicket: vi.fn(() => new Promise(() => {})),
  listTicketNotes: vi.fn(() => new Promise(() => {})),
  listTicketHistory: vi.fn(() => new Promise(() => {})),
}))
vi.mock('../services/adminUserService', () => ({ listEngineers: vi.fn() }))
vi.mock('../services/adminFacilityService', () => ({ getFacilities: vi.fn() }))

// GET /admin/metrics for ADMIN_TICKETS.
const METRICS = {
  unassigned: 2,
  open: 2,
  in_progress: 1,
  blocked: 0,
  resolved: 0,
  active_p1: 1,
  escalated: 1,
  closed: 1,
}

// GET /admin/facilities, trimmed to what the Building filter reads. Building B is inactive,
// but its tickets are still here, so admins can still filter by it.
const BUILDINGS = [
  { building_id: 1, building_name: 'Building A', is_active: true, active_ticket_count: 2, floors: [] },
  { building_id: 2, building_name: 'Building B', is_active: false, active_ticket_count: 1, floors: [] },
]

/** Serve ADMIN_TICKETS like the API would for the given filters (order is already triage order). */
function fakeApi(filters = {}) {
  let result = ADMIN_TICKETS
  if (filters.view === 'active') result = result.filter((t) => t.status !== 'closed')
  if (filters.view === 'closed') result = result.filter((t) => t.status === 'closed')
  for (const key of ['status', 'priority', 'category']) {
    if (filters[key]) result = result.filter((t) => t[key] === filters[key])
  }
  if (filters.building_id) result = result.filter((t) => t.building_id === Number(filters.building_id))
  if (filters.assigned_to) result = result.filter((t) => t.assigned_to_user_id === Number(filters.assigned_to))
  if (filters.assignment) result = result.filter((t) => (t.assigned_to_user_id !== null) === (filters.assignment === 'assigned'))
  if (filters.escalated) result = result.filter((t) => t.escalation_requested)
  if (filters.q) {
    const q = filters.q.toLowerCase()
    result = result.filter((t) => t.title.toLowerCase().includes(q) || t.created_by_name.toLowerCase().includes(q))
  }
  return Promise.resolve(result)
}

function renderDashboard({ width = 1280 } = {}) {
  const user = userEvent.setup()
  renderWithProviders(<App />, { route: '/admin', user: ALEX, width })
  return user
}

const queue = () => screen.getByRole('region', { name: /Needs an engineer/ })
const table = () => screen.getByRole('table', { name: 'All tickets' })
// Each row's title: the first text in its "Title · location" cell.
const rowTitles = () =>
  within(table()).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[1].querySelector('span').textContent)
// The queue always asks for exactly this; every other call is the all-tickets list.
const QUEUE_FILTERS = { assignment: 'unassigned', view: 'active' }
const lastListFilters = () =>
  vi.mocked(listAllTickets).mock.calls.map(([filters]) => filters)
    .filter((f) => JSON.stringify(f) !== JSON.stringify(QUEUE_FILTERS))
    .at(-1)

async function choose(user, label, option) {
  await user.click(screen.getByRole('combobox', { name: label }))
  await user.click(screen.getByRole('option', { name: option }))
}

beforeEach(() => {
  vi.mocked(listAllTickets).mockReset().mockImplementation(fakeApi)
  vi.mocked(getFacilities).mockReset().mockResolvedValue(BUILDINGS)
  vi.mocked(listEngineers).mockReset().mockResolvedValue(ENGINEERS)
  vi.mocked(assignTicket).mockReset()
  vi.mocked(getMetrics).mockReset().mockResolvedValue(METRICS)
})

describe('AdminDashboardPage: needs an engineer', () => {
  it('lists active unassigned tickets in triage order, with priority and escalation', async () => {
    renderDashboard()
    expect(screen.getByRole('heading', { level: 1, name: 'Facility Admin dashboard' })).toBeInTheDocument()

    const cards = await within(queue()).findAllByRole('listitem')
    expect(listAllTickets).toHaveBeenCalledWith(QUEUE_FILTERS, expect.anything())
    expect(within(queue()).getByLabelText('2 unassigned')).toHaveTextContent('2')
    expect(cards.map((card) => within(card).getByRole('link').textContent)).toEqual(['#7', '#1'])
    expect(cards[0]).toHaveTextContent('Lobby lights out')
    expect(cards[1]).toHaveTextContent('Wi-Fi keeps dropping')
    expect(within(cards[0]).getByLabelText('Priority P1: Building-wide')).toBeInTheDocument()
    expect(within(cards[0]).getByLabelText(/^waiting \d+ (min|h|d)$/)).toBeInTheDocument()
    expect(within(cards[0]).queryByText('Escalated')).not.toBeInTheDocument()
    expect(within(cards[1]).getByText('Escalated')).toBeInTheDocument()
    expect(within(cards[1]).getByRole('link')).toHaveAttribute('href', '/admin/tickets/1')
  })

  it('says so when every active ticket has an engineer', async () => {
    vi.mocked(listAllTickets).mockImplementation((filters) =>
      filters.assignment === 'unassigned' ? Promise.resolve([]) : fakeApi(filters),
    )
    renderDashboard()
    expect(await within(queue()).findByText('Every active ticket has an engineer.')).toBeInTheDocument()
    expect(within(queue()).getByLabelText('0 unassigned')).toBeInTheDocument()
  })

  it('shows a placeholder while the queue loads', () => {
    vi.mocked(listAllTickets).mockReturnValue(new Promise(() => {}))
    renderDashboard()
    expect(screen.getByLabelText('Loading unassigned tickets')).toBeInTheDocument()
    expect(screen.queryByLabelText(/unassigned$/)).not.toBeInTheDocument()
  })

  it('explains a failed load and retries', async () => {
    vi.mocked(listAllTickets)
      .mockRejectedValueOnce(new ApiError("Can't reach the server. Check your connection and try again.", { status: 0 }))
      .mockImplementation(fakeApi)
    const user = renderDashboard()

    expect(await within(queue()).findByRole('alert')).toHaveTextContent("Can't reach the server.")
    await user.click(within(queue()).getByRole('button', { name: 'Try again' }))
    expect(await within(queue()).findAllByRole('listitem')).toHaveLength(2)
  })
})

describe('AdminDashboardPage: all tickets', () => {
  it('starts on active tickets in triage order, with category, engineer and age', async () => {
    renderDashboard()
    await screen.findByRole('table')

    expect(rowTitles()).toEqual(['Lobby lights out', 'Printer jam', 'Wi-Fi keeps dropping'])
    expect(lastListFilters()).toEqual({ view: 'active' })
    expect(screen.getByText('Active tickets · 3')).toBeInTheDocument()
    const [lights, printer, wifi] = within(table()).getAllByRole('row').slice(1)
    expect(within(lights).getByLabelText('Priority P1: Building-wide')).toBeInTheDocument()
    expect(lights).toHaveTextContent('Electrical / Power')
    expect(lights).toHaveTextContent('Unassigned')
    expect(lights).toHaveTextContent('Building B')
    expect(within(lights).getAllByRole('cell').at(-1)).toHaveTextContent(/^\d+ (min|h|d)$/)
    expect(printer).toHaveTextContent('In Progress')
    expect(printer).toHaveTextContent('Sam Tech')
    expect(within(printer).getByRole('link', { name: '#5' })).toHaveAttribute('href', '/admin/tickets/5')
    expect(within(lights).queryByRole('img', { name: 'Escalated' })).not.toBeInTheDocument()
    expect(within(wifi).getByRole('img', { name: 'Escalated' })).toBeInTheDocument()
  })

  it('opens a ticket from anywhere on its row', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')

    await user.click(within(table()).getByText('Printer jam'))

    // The details page takes over.
    expect(await screen.findByLabelText('Loading ticket')).toBeInTheDocument()
    expect(getTicket).toHaveBeenCalledWith({ ticketId: '5' }, expect.anything())
    expect(screen.queryByRole('table', { name: 'All tickets' })).not.toBeInTheDocument()
  })

  it('filters by status, priority, category and building', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')

    await choose(user, 'Priority', 'P1 · Building-wide')
    await waitFor(() => expect(rowTitles()).toEqual(['Lobby lights out']))
    expect(lastListFilters()).toEqual({ view: 'active', priority: 'P1' })

    await choose(user, 'Priority', 'All priorities')
    await choose(user, 'Building', 'Building A')
    await waitFor(() => expect(rowTitles()).toEqual(['Printer jam', 'Wi-Fi keeps dropping']))
    expect(lastListFilters()).toEqual({ view: 'active', building_id: '1' })
    expect(screen.queryByRole('combobox', { name: 'Assignment' })).not.toBeInTheDocument()

    await choose(user, 'Category', 'Network / Internet')
    await choose(user, 'Status', 'Open')
    await waitFor(() => expect(rowTitles()).toEqual(['Wi-Fi keeps dropping']))
    expect(lastListFilters()).toEqual({ view: 'active', building_id: '1', category: 'network', status: 'open' })
  })

  it('shows only escalated tickets when asked', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')

    await user.click(screen.getByRole('switch', { name: 'Escalated only' }))

    await waitFor(() => expect(rowTitles()).toEqual(['Wi-Fi keeps dropping']))
    expect(lastListFilters()).toEqual({ view: 'active', escalated: true })
  })

  it('switches between active, closed and all', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Closed' }))
    await waitFor(() => expect(rowTitles()).toEqual(['Old lamp']))
    expect(lastListFilters()).toEqual({ view: 'closed' })

    await user.click(screen.getByRole('button', { name: 'All' }))
    await waitFor(() => expect(rowTitles()).toHaveLength(4))
    expect(lastListFilters()).toEqual({})
  })

  it('searches by requester once typing pauses', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')
    const callsBefore = vi.mocked(listAllTickets).mock.calls.length

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'eve')

    // Generous timeout: under a full parallel run the 300 ms debounce can take a while to land.
    await waitFor(() => expect(rowTitles()).toEqual(['Lobby lights out']), { timeout: 3000 })
    expect(vi.mocked(listAllTickets).mock.calls.length - callsBefore).toBe(1)
    expect(lastListFilters()).toEqual({ view: 'active', q: 'eve' })
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

  it('pages through long lists, and starts again on page one when the filters change', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ ...ADMIN_TICKETS[0], ticket_id: 100 + i, title: `Ticket ${i + 1}` }))
    vi.mocked(listAllTickets).mockImplementation((filters) =>
      filters.assignment === 'unassigned' || filters.priority ? fakeApi(filters) : Promise.resolve(many),
    )
    const user = renderDashboard()
    await screen.findByRole('table')

    expect(rowTitles()).toHaveLength(25)
    expect(screen.getByText('1–25 of 30')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Go to next page' }))
    expect(rowTitles()).toEqual(['Ticket 26', 'Ticket 27', 'Ticket 28', 'Ticket 29', 'Ticket 30'])

    await choose(user, 'Priority', 'P1 · Building-wide')
    await waitFor(() => expect(rowTitles()).toEqual(['Lobby lights out']))
    expect(screen.getByText('1–1 of 1')).toBeInTheDocument()
  })
})

describe('AdminDashboardPage: assigning from the queue', () => {
  const queueCard = async (title) =>
    (await within(queue()).findAllByRole('listitem')).find((card) => within(card).queryByText(new RegExp(title)))

  it('suggests the lightest-loaded engineer, so assigning takes one click, then refreshes everything', async () => {
    vi.mocked(assignTicket).mockResolvedValue({ ...ADMIN_TICKETS[0], assigned_to_user_id: 6, assigned_to_name: 'Kim Fixit' })
    const user = renderDashboard()
    const card = await queueCard('Lobby lights out')
    const assign = within(card).getByRole('button', { name: 'Assign' })
    await waitFor(() => expect(within(card).getByRole('combobox', { name: 'Assign to' })).toHaveTextContent('Kim Fixit · 0 active'))
    expect(assign).toBeEnabled()

    await user.click(within(card).getByRole('combobox', { name: 'Assign to' }))
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['Kim Fixit · 0 active', 'Sam Tech · 3 active, 1 P1'])
    await user.keyboard('{Escape}')
    const [queueCalls, engineerCalls] = [listAllTickets, listEngineers].map((fn) => vi.mocked(fn).mock.calls.length)
    await user.click(assign)

    expect(assignTicket).toHaveBeenCalledWith(7, '6')
    expect(await screen.findByText('#7 assigned to Kim Fixit.')).toBeInTheDocument()
    // The queue and the all-tickets list both reload, and so does the workload.
    expect(vi.mocked(listAllTickets).mock.calls.length - queueCalls).toBe(2)
    expect(vi.mocked(listEngineers).mock.calls.length - engineerCalls).toBe(1)

    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByText('#7 assigned to Kim Fixit.')).not.toBeInTheDocument())
  })

  it('explains a refused assignment on the card', async () => {
    vi.mocked(assignTicket).mockRejectedValue(new ApiError('Closed tickets can\'t be assigned', { status: 409 }))
    const user = renderDashboard()
    const card = await queueCard('Wi-Fi keeps dropping')

    await user.click(within(card).getByRole('combobox', { name: 'Assign to' }))
    await user.click(screen.getByRole('option', { name: 'Sam Tech · 3 active, 1 P1' }))
    await user.click(within(card).getByRole('button', { name: 'Assign' }))

    expect(await within(card).findByRole('alert')).toHaveTextContent("Closed tickets can't be assigned")
    expect(screen.queryByText(/assigned to/)).not.toBeInTheDocument()
  })

  it('says when there are no engineers to assign to', async () => {
    vi.mocked(listEngineers).mockResolvedValue([])
    renderDashboard()
    const card = await queueCard('Lobby lights out')
    expect(await within(card).findByText(/No engineers yet/)).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Assign' })).not.toBeInTheDocument()
  })
})

describe('AdminDashboardPage: engineer workload', () => {
  const workload = () => screen.getByRole('region', { name: 'Engineer workload' })

  it('shows each engineer\'s active tickets, lightest load first', async () => {
    renderDashboard()
    const cards = await within(workload()).findAllByRole('button')

    expect(cards.map((c) => c.getAttribute('aria-label'))).toEqual([
      'Kim Fixit: 0 active. Show their tickets',
      'Sam Tech: 3 active. Show their tickets',
    ])
    expect(cards[1]).toHaveTextContent('1 open · 1 in progress · 1 blocked')
    expect(within(cards[1]).getByText('1 P1')).toBeInTheDocument()
    expect(within(cards[0]).queryByText(/P1/)).not.toBeInTheDocument()
  })

  it('filters All tickets to the chosen engineer, and back', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')
    const sam = await within(workload()).findByRole('button', { name: /^Sam Tech/ })

    await user.click(sam)

    await waitFor(() => expect(rowTitles()).toEqual(['Printer jam']))
    expect(lastListFilters()).toEqual({ view: 'active', assigned_to: '4' })
    expect(within(workload()).getByRole('button', { name: /^Sam Tech/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('combobox', { name: 'Engineer' })).toHaveTextContent('Sam Tech')

    await user.click(within(workload()).getByRole('button', { name: /^Sam Tech/ }))
    await waitFor(() => expect(rowTitles()).toHaveLength(3))
    expect(within(workload()).getByRole('button', { name: /^Sam Tech/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('opens filtered to an engineer from ?engineer=', async () => {
    renderWithProviders(<App />, { route: '/admin?engineer=4', user: ALEX })
    await screen.findByRole('table')

    await waitFor(() => expect(rowTitles()).toEqual(['Printer jam']))
    expect(lastListFilters()).toEqual({ view: 'active', assigned_to: '4' })
    expect(await within(workload()).findByRole('button', { name: /^Sam Tech/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('ignores a malformed ?engineer= or ?building=', async () => {
    renderWithProviders(<App />, { route: '/admin?engineer=abc&building=0', user: ALEX })
    await screen.findByRole('table')
    expect(lastListFilters()).toEqual({ view: 'active' })
  })

  it('opens filtered to a building from ?building=, inactive ones included', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/admin?building=2', user: ALEX })
    await screen.findByRole('table')

    await waitFor(() => expect(rowTitles()).toEqual(['Lobby lights out']))
    expect(lastListFilters()).toEqual({ view: 'active', building_id: '2' })
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Building' })).toHaveTextContent('Building B (inactive)'))

    await user.click(screen.getByRole('combobox', { name: 'Building' }))
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'All buildings',
      'Building A',
      'Building B (inactive)',
    ])
  })

  it('has an Engineer filter too', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')

    await choose(user, 'Engineer', 'Sam Tech')

    await waitFor(() => expect(rowTitles()).toEqual(['Printer jam']))
    expect(lastListFilters()).toEqual({ view: 'active', assigned_to: '4' })
  })

  it('explains a failed load and retries', async () => {
    vi.mocked(listEngineers)
      .mockRejectedValueOnce(new ApiError('Something went wrong on our side. Please try again.', { status: 500 }))
      .mockResolvedValue(ENGINEERS)
    const user = renderDashboard()

    expect(await within(workload()).findByRole('alert')).toHaveTextContent('Something went wrong on our side.')
    // Shown once, not again on every queue card.
    expect(within(queue()).queryByRole('alert')).not.toBeInTheDocument()
    await user.click(within(workload()).getByRole('button', { name: 'Try again' }))
    expect(await within(workload()).findAllByRole('button')).toHaveLength(2)
  })

  it('says when there are no engineers yet', async () => {
    vi.mocked(listEngineers).mockResolvedValue([])
    renderDashboard()
    expect(await within(workload()).findByText(/No engineers yet/)).toBeInTheDocument()
  })
})

describe('AdminDashboardPage: metric cards', () => {
  const numbers = () => screen.getByRole('list', { name: 'Tickets in numbers' })
  const card = (label) => within(numbers()).getByRole('button', { name: new RegExp(`^${label}:`) })

  it('shows each count', async () => {
    renderDashboard()
    const cards = await within(await screen.findByRole('list', { name: 'Tickets in numbers' })).findAllByRole('button')
    // Active adds up open, in progress, blocked and resolved: 2 + 1 + 0 + 0.
    expect(cards.map((c) => c.textContent)).toEqual([
      'Active3open tickets',
      'Unassigned2need engineer',
      'Escalated1by requesters',
      'Blocked0waiting',
      'Resolved0awaiting close',
      'Closed1all time',
    ])
    expect(screen.queryByRole('button', { name: /P1/ })).not.toBeInTheDocument()
  })

  it.each([
    ['Unassigned', { view: 'active', assignment: 'unassigned' }],
    ['Escalated', { view: 'active', escalated: true }],
    ['Blocked', { view: 'active', status: 'blocked' }],
    ['Resolved', { view: 'active', status: 'resolved' }],
    ['Closed', { view: 'closed' }],
  ])('%s shows exactly its tickets, and again clears it', async (label, query) => {
    const user = renderDashboard()
    await screen.findByRole('table')
    await screen.findByRole('list', { name: 'Tickets in numbers' })

    await user.click(card(label))

    await waitFor(() => expect(lastListFilters()).toEqual(query))
    expect(card(label)).toHaveAttribute('aria-pressed', 'true')

    await user.click(card(label))
    await waitFor(() => expect(lastListFilters()).toEqual({ view: 'active' }))
    expect(card(label)).toHaveAttribute('aria-pressed', 'false')
  })

  it('names the chosen card above the table, and its chip clears it', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')
    await screen.findByRole('list', { name: 'Tickets in numbers' })

    await user.click(card('Escalated'))
    const panel = screen.getByRole('region', { name: 'All tickets' })
    const chip = await within(panel).findByRole('button', { name: 'Escalated' })

    await user.click(within(chip).getByTestId('CancelIcon'))
    await waitFor(() => expect(lastListFilters()).toEqual({ view: 'active' }))
    expect(within(panel).queryByRole('button', { name: 'Escalated' })).not.toBeInTheDocument()
  })

  it('Active goes back to every active ticket and is never shown as pressed', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')
    await screen.findByRole('list', { name: 'Tickets in numbers' })
    expect(card('Active')).not.toHaveAttribute('aria-pressed')

    await choose(user, 'Priority', 'P1 · Building-wide')
    await waitFor(() => expect(lastListFilters()).toEqual({ view: 'active', priority: 'P1' }))
    await user.click(card('Active'))

    await waitFor(() => expect(lastListFilters()).toEqual({ view: 'active' }))
    expect(screen.getByRole('combobox', { name: 'Priority' })).toHaveTextContent('Priority')
  })

  it('shows as selected when the filters match a card by hand', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')
    await screen.findByRole('list', { name: 'Tickets in numbers' })

    await choose(user, 'Status', 'Blocked')

    expect(card('Blocked')).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows a placeholder while loading', () => {
    vi.mocked(getMetrics).mockReturnValue(new Promise(() => {}))
    renderDashboard()
    expect(screen.getByLabelText('Loading the numbers')).toBeInTheDocument()
  })

  it('explains a failed load and retries', async () => {
    vi.mocked(getMetrics)
      .mockRejectedValueOnce(new ApiError('Something went wrong on our side. Please try again.', { status: 500 }))
      .mockResolvedValue(METRICS)
    const user = renderDashboard()

    const alert = await screen.findByText('Something went wrong on our side. Please try again.')
    await user.click(within(alert.closest('[role="alert"]')).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('list', { name: 'Tickets in numbers' })).toBeInTheDocument()
  })

  it('refreshes after a quick assign', async () => {
    vi.mocked(assignTicket).mockResolvedValue({ ...ADMIN_TICKETS[0], assigned_to_user_id: 6, assigned_to_name: 'Kim Fixit' })
    const user = renderDashboard()
    const card7 = (await within(queue()).findAllByRole('listitem')).find((c) => within(c).queryByText(/#7/))
    await waitFor(() => expect(within(card7).getByRole('button', { name: 'Assign' })).toBeEnabled())
    const loads = vi.mocked(getMetrics).mock.calls.length

    await user.click(within(card7).getByRole('button', { name: 'Assign' }))

    await screen.findByText('#7 assigned to Kim Fixit.')
    expect(vi.mocked(getMetrics).mock.calls.length).toBe(loads + 1)
  })
})

describe('AdminDashboardPage: on a phone', () => {
  const renderPhone = () => renderDashboard({ width: 375 })
  const tab = (name) => screen.getByRole('tab', { name: new RegExp(`^${name}`) })

  it('opens on the queue tab, with its count, as cards with a one-click assign', async () => {
    renderPhone()
    const cards = await within(queue()).findAllByRole('listitem')

    expect(tab('Queue')).toHaveAttribute('aria-selected', 'true')
    expect(tab('Queue')).toHaveTextContent('Queue2')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(cards[0]).toHaveTextContent('Lobby lights out')
    expect(cards[0]).toHaveTextContent('Building B')
    await waitFor(() => expect(within(cards[0]).getByRole('button', { name: 'Assign' })).toBeEnabled())
    // The heading is still there for screen readers, though the tab names it on screen.
    expect(screen.getByRole('heading', { level: 2, name: 'Needs an engineer' })).toBeInTheDocument()
  })

  it('shows tickets as cards on the Tickets tab', async () => {
    const user = renderPhone()
    await user.click(tab('Tickets'))

    const card = (await screen.findByText('Printer jam')).closest('a')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(card).toHaveAttribute('href', '/admin/tickets/5')
    expect(card).toHaveTextContent('#5')
    expect(card).toHaveTextContent('Sam Tech')
    expect(within(card).getByLabelText('Priority P2: A whole floor')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /Needs an engineer/ })).not.toBeInTheDocument()
  })

  it('jumps to Tickets, filtered, when a count is tapped', async () => {
    const user = renderPhone()
    const numbers = await screen.findByRole('list', { name: 'Tickets in numbers' })

    await user.click(within(numbers).getByRole('button', { name: /^Escalated:/ }))

    expect(tab('Tickets')).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => expect(lastListFilters()).toEqual({ view: 'active', escalated: true }))
    expect(await screen.findByText('Wi-Fi keeps dropping')).toBeInTheDocument()
    expect(screen.queryByText('Printer jam')).not.toBeInTheDocument()
  })

  it('keeps search on screen and folds the other filters behind a button', async () => {
    const user = renderPhone()
    await user.click(tab('Tickets'))
    await screen.findByText('Printer jam')

    expect(screen.getByRole('searchbox', { name: 'Search' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Priority' })).not.toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: 'Show filters' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)
    expect(screen.getByRole('button', { name: 'Hide filters' })).toHaveAttribute('aria-expanded', 'true')
    await choose(user, 'Priority', 'P1 · Building-wide')
    await waitFor(() => expect(lastListFilters()).toEqual({ view: 'active', priority: 'P1' }))

    await user.click(screen.getByRole('button', { name: 'Closed' }))
    await waitFor(() => expect(lastListFilters()).toEqual({ view: 'closed', priority: 'P1' }))
    expect(await screen.findByText('No tickets match these filters.')).toBeInTheDocument()
  })

  it('shows the workload on the Engineers tab; tapping one lists their tickets', async () => {
    const user = renderPhone()
    await user.click(tab('Engineers'))
    const workload = screen.getByRole('region', { name: 'Engineer workload' })

    await user.click(await within(workload).findByRole('button', { name: /^Sam Tech/ }))

    expect(tab('Tickets')).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => expect(lastListFilters()).toEqual({ view: 'active', assigned_to: '4' }))
    expect(await screen.findByText('Printer jam')).toBeInTheDocument()
  })
})
