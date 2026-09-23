import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import App from './App'
import { SESSION_ENDED } from './auth/AuthContext'
import { api } from './services/apiClient'
import { getStoredUser } from './services/session'
import { JANE, renderWithProviders } from './test/renderWithProviders'

// The dashboard loads tickets on arrival; these tests only care about routing and sign-in.
vi.mock('./services/ticketService', () => ({ listMyTickets: vi.fn().mockResolvedValue([]) }))

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
    expect(getStoredUser()).toBeNull()
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
