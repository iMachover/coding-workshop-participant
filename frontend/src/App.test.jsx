import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import App from './App'
import { renderWithProviders } from './test/renderWithProviders'

describe('routing', () => {
  it('sends the start page to sign in', () => {
    renderWithProviders(<App />, { route: '/' })
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
  })

  it.each([
    ['/register', 'Create your account'],
    ['/login', 'Sign in'],
    ['/dashboard', 'My dashboard'],
    ['/no-such-page', 'Page not found'],
  ])('%s shows "%s"', (route, heading) => {
    renderWithProviders(<App />, { route })
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
  })

  it('offers a way back from an unknown page', () => {
    renderWithProviders(<App />, { route: '/no-such-page' })
    expect(screen.getByRole('link', { name: 'Go to the start page' })).toHaveAttribute('href', '/')
  })
})

describe('header', () => {
  it('shows the full name on desktop', () => {
    renderWithProviders(<App />, { route: '/login', width: 1280 })
    expect(screen.getByRole('link', { name: 'Facilities Helpdesk' })).toHaveAttribute('href', '/')
  })

  it('shortens the name on phones', () => {
    renderWithProviders(<App />, { route: '/login', width: 375 })
    expect(screen.getByRole('link', { name: 'Helpdesk' })).toBeInTheDocument()
    expect(screen.queryByText('Facilities Helpdesk')).not.toBeInTheDocument()
  })
})
