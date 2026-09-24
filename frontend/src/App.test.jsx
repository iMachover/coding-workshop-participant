import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { SESSION_ENDED } from './auth/AuthContext'
import { api } from './services/apiClient'
import { getSession } from './services/session'
import { listMyTickets } from './services/ticketService'
import { ALEX, JANE, renderWithProviders, SAM } from './test/renderWithProviders'

// The dashboards load tickets on arrival; these tests only care about routing and sign-in.
vi.mock('./services/ticketService', () => ({ listMyTickets: vi.fn().mockResolvedValue([]) }))
vi.mock('./services/adminTicketService', () => ({
  listAllTickets: vi.fn().mockResolvedValue([]),
  getMetrics: vi.fn().mockResolvedValue({ unassigned: 0, open: 0, in_progress: 0, blocked: 0, resolved: 0, active_p1: 0, escalated: 0, closed: 0 }),
  // Ticket details stay loading: the page-frame tests only look at the layout around them.
  getTicket: vi.fn(() => new Promise(() => {})),
  listTicketNotes: vi.fn(() => new Promise(() => {})),
  listTicketHistory: vi.fn(() => new Promise(() => {})),
}))
vi.mock('./services/locationService', () => ({
  listBuildings: vi.fn().mockResolvedValue([]),
  listFloors: vi.fn().mockResolvedValue([]),
  listSeats: vi.fn().mockResolvedValue([]),
}))
vi.mock('./services/adminFacilityService', () => ({ getFacilities: vi.fn().mockResolvedValue([]) }))
vi.mock('./services/adminUserService', () => ({
  listEngineers: vi.fn().mockResolvedValue([]),
  listUsers: vi.fn().mockResolvedValue([]),
}))
vi.mock('./services/engineerTicketService', () => ({
  listMyQueue: vi.fn().mockResolvedValue([]),
  getAssignedTicket: vi.fn(),
  listAssignedTicketHistory: vi.fn(),
  listAssignedTicketNotes: vi.fn(),
  addAssignedTicketNote: vi.fn(),
}))

const heading = () => screen.getByRole('heading', { level: 1 })

describe('routing for guests', () => {
  it.each([
    ['/', 'Sign in'],
    ['/login', 'Sign in'],
    ['/register', 'Create your account'],
    ['/no-such-page', 'Page not found'],
  ])('%s shows "%s"', (route, name) => {
    renderWithProviders(<App />, { route })
    expect(heading()).toHaveTextContent(name)
  })

  it('sends /dashboard to sign in, with a reason', () => {
    renderWithProviders(<App />, { route: '/dashboard' })
    expect(heading()).toHaveTextContent('Sign in')
    expect(screen.getByRole('alert')).toHaveTextContent('Please sign in to continue.')
  })

  it('offers a way back from an unknown page', () => {
    renderWithProviders(<App />, { route: '/no-such-page' })
    expect(screen.getByRole('link', { name: 'Go to the start page' })).toHaveAttribute('href', '/')
  })
})

describe('routing when signed in', () => {
  it.each(['/', '/dashboard', '/login', '/register'])('%s shows the dashboard', (route) => {
    renderWithProviders(<App />, { route, user: JANE })
    expect(heading()).toHaveTextContent('My dashboard')
  })
})

describe('routing by role', () => {
  beforeEach(() => {
    vi.mocked(listMyTickets).mockClear()
  })

  it.each([
    ['engineer', '/', 'My queue', SAM],
    ['engineer', '/login', 'My queue', SAM],
    ['engineer', '/register', 'My queue', SAM],
    ['engineer', '/engineer', 'My queue', SAM],
    ['admin', '/', 'Facility Admin dashboard', ALEX],
    ['admin', '/login', 'Facility Admin dashboard', ALEX],
    ['admin', '/admin', 'Facility Admin dashboard', ALEX],
  ])('%s at %s sees "%s"', async (_role, route, name, user) => {
    renderWithProviders(<App />, { route, user })
    expect(heading()).toHaveTextContent(name)
    // Let the dashboard's first loads settle before the test ends.
    await act(async () => {})
  })

  it('gives engineers their queue, without calling the employee tickets API', async () => {
    renderWithProviders(<App />, { route: '/engineer', user: SAM })
    expect(await screen.findByText('Nothing waiting. Nice work.')).toBeInTheDocument()
    expect(listMyTickets).not.toHaveBeenCalled()
  })

  it('gives admins their dashboard, without calling the employee tickets API', async () => {
    renderWithProviders(<App />, { route: '/admin', user: ALEX })
    expect(await screen.findByText('Every active ticket has an engineer.')).toBeInTheDocument()
    expect(listMyTickets).not.toHaveBeenCalled()
  })

  it.each([
    ['engineer', '/dashboard', '/engineer', 'Engineer', SAM],
    ['engineer', '/tickets/new', '/engineer', 'Engineer', SAM],
    ['engineer', '/tickets/5', '/engineer', 'Engineer', SAM],
    ['engineer', '/admin', '/engineer', 'Engineer', SAM],
    ['engineer', '/admin/tickets/5', '/engineer', 'Engineer', SAM],
    ['admin', '/dashboard', '/admin', 'Facility Admin', ALEX],
    ['admin', '/engineer', '/admin', 'Facility Admin', ALEX],
    ['employee', '/engineer', '/dashboard', 'Employee', JANE],
    ['employee', '/admin', '/dashboard', 'Employee', JANE],
    ['employee', '/admin/tickets/5', '/dashboard', 'Employee', JANE],
    ['admin', '/tickets/5', '/admin', 'Facility Admin', ALEX],
    ['employee', '/admin/people', '/dashboard', 'Employee', JANE],
    ['engineer', '/admin/people', '/engineer', 'Engineer', SAM],
  ])('%s at %s is told it has no access, with a link to %s', (_role, route, home, label, user) => {
    renderWithProviders(<App />, { route, user })

    expect(heading()).toHaveTextContent("You don't have access to this")
    expect(screen.getByText(`This page isn't available to your role. You're signed in as ${label}.`)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to my start page' })).toHaveAttribute('href', home)
    expect(listMyTickets).not.toHaveBeenCalled()
  })

  it('takes staff from the no-access page to their own start page', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/dashboard', user: SAM })

    await user.click(screen.getByRole('link', { name: 'Go to my start page' }))

    expect(heading()).toHaveTextContent('My queue')
    await act(async () => {})
  })
})

describe('header navigation', () => {
  const nav = () => screen.getByRole('navigation', { name: 'Main' })

  it.each([
    ['/admin', 'Dashboard', 'Facility Admin dashboard'],
    ['/admin/people', 'People', 'People'],
    ['/admin/facilities', 'Facilities', 'Facilities'],
  ])('marks the current admin page at %s', async (route, current, title) => {
    renderWithProviders(<App />, { route, user: ALEX })
    expect(heading()).toHaveTextContent(title)
    expect(within(nav()).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/admin')
    expect(within(nav()).getByRole('link', { name: 'People' })).toHaveAttribute('href', '/admin/people')
    expect(within(nav()).getByRole('link', { name: 'Facilities' })).toHaveAttribute('href', '/admin/facilities')
    expect(within(nav()).getByRole('link', { current: 'page' })).toHaveTextContent(current)
    await act(async () => {})
  })

  it('moves between admin pages', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/admin', user: ALEX })

    await user.click(within(nav()).getByRole('link', { name: 'People' }))
    expect(heading()).toHaveTextContent('People')
    await user.click(within(nav()).getByRole('link', { name: 'Facilities' }))
    expect(heading()).toHaveTextContent('Facilities')
    await user.click(within(nav()).getByRole('link', { name: 'Dashboard' }))
    expect(heading()).toHaveTextContent('Facility Admin dashboard')
    await act(async () => {})
  })

  it('puts the links on a second row on phones', async () => {
    renderWithProviders(<App />, { route: '/admin/people', user: ALEX, width: 375 })
    const tabs = within(nav()).getAllByRole('tab')
    expect(tabs.map((a) => a.textContent)).toEqual(['Dashboard', 'People', 'Facilities'])
    expect(tabs[1]).toHaveAttribute('aria-current', 'page')
    await act(async () => {})
  })

  it('gives engineers a link to their queue, current on a ticket too', () => {
    // An invalid id shows "not found" without calling the API; the header is what matters here.
    renderWithProviders(<App />, { route: '/engineer/tickets/abc', user: SAM })
    expect(within(nav()).getByRole('link', { current: 'page' })).toHaveTextContent('My queue')
    expect(within(nav()).getByRole('link', { name: 'My queue' })).toHaveAttribute('href', '/engineer')
  })

  it('gives employees no page links', () => {
    renderWithProviders(<App />, { route: '/', user: JANE })
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  })
})

describe('header', () => {
  it('shows only the app name to guests', () => {
    renderWithProviders(<App />, { route: '/login' })
    expect(screen.getByRole('link', { name: /ACME Facilities/ })).toHaveAttribute('href', '/')
    expect(screen.getByRole('banner')).toHaveTextContent('Incident Desk')
    expect(screen.queryByRole('button', { name: 'Account' })).not.toBeInTheDocument()
  })

  it("shows the user's initials and name on the Account button on desktop", () => {
    renderWithProviders(<App />, { route: '/dashboard', user: JANE, width: 1280 })
    const account = screen.getByRole('button', { name: 'Account' })
    expect(account).toHaveTextContent('JDJane Doe')
    expect(account).toHaveAttribute('aria-haspopup', 'menu')
    expect(account).toHaveAttribute('aria-expanded', 'false')
  })

  it("lists the user's name, email and role in the Account menu", async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/', user: SAM, width: 1280 })

    await user.click(screen.getByRole('button', { name: 'Account' }))

    expect(screen.getByRole('button', { name: 'Account', hidden: true })).toHaveAttribute('aria-expanded', 'true')
    const menu = screen.getByRole('menu')
    expect(menu).toHaveTextContent('Sam Tech')
    expect(menu).toHaveTextContent('sam@acme.inc')
    expect(menu).toHaveTextContent('Engineer')
    expect(within(menu).getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('opens the Account menu with Enter and closes it with Escape', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/dashboard', user: JANE, width: 1280 })

    const account = screen.getByRole('button', { name: 'Account' })
    account.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(account).toHaveFocus()
  })

  it('shows no role chip to employees', () => {
    renderWithProviders(<App />, { route: '/dashboard', user: JANE })
    expect(screen.queryByText('Employee')).not.toBeInTheDocument()
  })

  it.each([
    ['Engineer', 1280, SAM],
    ['Engineer', 375, SAM],
    ['Facility Admin', 1280, ALEX],
  ])('shows the %s role chip at %spx wide', (label, width, user) => {
    renderWithProviders(<App />, { route: '/', user, width })
    expect(screen.getByRole('banner')).toHaveTextContent(label)
  })

  it('shows the full name and an avatar-only Account button on phones', () => {
    renderWithProviders(<App />, { route: '/dashboard', user: JANE, width: 375 })
    expect(screen.getByRole('link', { name: /ACME Facilities/ })).toBeInTheDocument()
    expect(screen.getByRole('banner')).toHaveTextContent('Incident Desk')
    expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Account' })).toHaveTextContent(/^JD$/)
  })

  it('signs out, forgets the session and says so', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/dashboard', user: JANE })

    await user.click(screen.getByRole('button', { name: 'Account' }))
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))

    expect(heading()).toHaveTextContent('Sign in')
    expect(screen.getByRole('alert')).toHaveTextContent("You've signed out.")
    expect(getSession()).toBeNull()
    expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument()
  })

  it('sends the user to sign in when the API rejects their session', async () => {
    renderWithProviders(<App />, { route: '/dashboard', user: JANE })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ detail: 'Unknown user' }),
    }))

    await act(() => api.get('/tickets').catch(() => {}))

    expect(heading()).toHaveTextContent('Sign in')
    expect(screen.getByRole('alert')).toHaveTextContent(SESSION_ENDED)
  })
})

describe('page frame', () => {
  const contained = () => screen.getByRole('main').classList.contains('MuiContainer-maxWidthLg')

  it.each([
    ['/dashboard', JANE],
    ['/engineer/', SAM],
    ['/admin', ALEX],
    ['/admin/people', ALEX],
    ['/admin/facilities', ALEX],
    ['/admin/tickets/abc', ALEX],
  ])('gives %s the full-screen frame', async (route, user) => {
    renderWithProviders(<App />, { route, user })
    expect(contained()).toBe(false)
    await act(async () => {})
  })

  it.each([
    ['/tickets/new', JANE],
    ['/engineer/tickets/abc', SAM],
  ])('keeps %s in the 1200px column', async (route, user) => {
    renderWithProviders(<App />, { route, user })
    expect(contained()).toBe(true)
    await act(async () => {})
  })
})
