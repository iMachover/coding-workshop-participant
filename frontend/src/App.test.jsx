import { act, screen } from '@testing-library/react'
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
vi.mock('./services/adminTicketService', () => ({ listAllTickets: vi.fn().mockResolvedValue([]) }))
vi.mock('./services/locationService', () => ({ listBuildings: vi.fn().mockResolvedValue([]) }))

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
    ['engineer', '/', 'Engineer workspace', SAM],
    ['engineer', '/login', 'Engineer workspace', SAM],
    ['engineer', '/register', 'Engineer workspace', SAM],
    ['engineer', '/engineer', 'Engineer workspace', SAM],
    ['admin', '/', 'Facility Admin dashboard', ALEX],
    ['admin', '/login', 'Facility Admin dashboard', ALEX],
    ['admin', '/admin', 'Facility Admin dashboard', ALEX],
  ])('%s at %s sees "%s"', async (_role, route, name, user) => {
    renderWithProviders(<App />, { route, user })
    expect(heading()).toHaveTextContent(name)
    // Let the admin dashboard's first loads settle before the test ends.
    await act(async () => {})
  })

  it('tells engineers what their start page will hold, without calling the tickets API', () => {
    renderWithProviders(<App />, { route: '/engineer', user: SAM })
    expect(screen.getByText('Signed in as Sam Tech · Engineer')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Your ticket queue is on its way.')
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

    expect(heading()).toHaveTextContent('Engineer workspace')
  })
})

describe('header', () => {
  it('shows only the app name to guests', () => {
    renderWithProviders(<App />, { route: '/login' })
    expect(screen.getByRole('link', { name: 'Facilities Helpdesk' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  })

  it('shows the user and a sign-out button on desktop', () => {
    renderWithProviders(<App />, { route: '/dashboard', user: JANE, width: 1280 })
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toHaveTextContent('Sign out')
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

  it('uses a short name and an icon-only sign-out on phones', () => {
    renderWithProviders(<App />, { route: '/dashboard', user: JANE, width: 375 })
    expect(screen.getByRole('link', { name: 'Helpdesk' })).toBeInTheDocument()
    expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toHaveTextContent('')
  })

  it('signs out, forgets the session and says so', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/dashboard', user: JANE })

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

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
