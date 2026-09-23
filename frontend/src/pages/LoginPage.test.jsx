import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../App'
import { ApiError } from '../services/apiClient'
import { login } from '../services/authService'
import { getStoredUser } from '../services/session'
import { JANE, renderWithProviders } from '../test/renderWithProviders'

vi.mock('../services/authService', () => ({ login: vi.fn(), register: vi.fn() }))

const emailField = () => screen.getByLabelText(/^Work email/)
const passwordField = () => screen.getByLabelText(/^Password/)
const submitButton = () => screen.getByRole('button', { name: /sign in|signing in/i })

function renderPage(route = '/login') {
  const user = userEvent.setup()
  renderWithProviders(<App />, { route })
  return user
}

async function signInAs(user, email = 'jane@acme.inc', password = 'password123') {
  await user.type(emailField(), email)
  await user.type(passwordField(), password)
  await user.click(submitButton())
}

beforeEach(() => {
  vi.mocked(login).mockReset()
})

describe('LoginPage', () => {
  it('shows required email and password fields and a link to sign up', () => {
    renderPage()
    expect(emailField()).toBeRequired()
    expect(passwordField()).toBeRequired()
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('pre-fills the email after registering and starts on the password', () => {
    renderPage({ pathname: '/login', state: { registeredEmail: 'new@acme.inc' } })
    expect(screen.getByRole('alert')).toHaveTextContent('Account created for new@acme.inc. Please sign in.')
    expect(emailField()).toHaveValue('new@acme.inc')
    expect(passwordField()).toHaveFocus()
  })

  it('asks for both fields before sending', async () => {
    const user = renderPage()

    await user.click(submitButton())

    expect(login).not.toHaveBeenCalled()
    expect(screen.getByText('Enter your work email.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
    expect(emailField()).toHaveFocus()
  })

  it('focuses the password when only it is missing, and clears the error on typing', async () => {
    const user = renderPage()
    await user.type(emailField(), 'jane@acme.inc')

    await user.click(submitButton())
    expect(passwordField()).toHaveFocus()

    await user.type(passwordField(), 'x')
    expect(screen.queryByText('Enter your password.')).not.toBeInTheDocument()
  })

  it('signs in, remembers the user and opens the dashboard', async () => {
    vi.mocked(login).mockResolvedValue(JANE)
    const user = renderPage()

    await signInAs(user)

    expect(login).toHaveBeenCalledWith({ email: 'jane@acme.inc', password: 'password123' })
    expect(await screen.findByRole('heading', { level: 1, name: 'My dashboard' })).toBeInTheDocument()
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    expect(getStoredUser()).toEqual(JANE)
  })

  it('returns to the page that asked for sign-in', async () => {
    vi.mocked(login).mockResolvedValue(JANE)
    const user = renderPage('/dashboard')
    expect(screen.getByRole('alert')).toHaveTextContent('Please sign in to continue.')

    await signInAs(user)

    expect(await screen.findByRole('heading', { level: 1, name: 'My dashboard' })).toBeInTheDocument()
  })

  it('disables the form while signing in', async () => {
    let finish
    vi.mocked(login).mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const user = renderPage()

    await signInAs(user)

    expect(submitButton()).toBeDisabled()
    expect(submitButton()).toHaveTextContent('Signing in…')
    expect(emailField()).toBeDisabled()
    finish(JANE)
    await screen.findByRole('heading', { level: 1, name: 'My dashboard' })
  })

  it('shows a wrong password as one message and stays signed out', async () => {
    vi.mocked(login).mockRejectedValue(new ApiError('Invalid email or password', { status: 401 }))
    const user = renderPage('/dashboard')

    await signInAs(user)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password'))
    expect(screen.queryByText('Please sign in to continue.')).not.toBeInTheDocument()
    expect(submitButton()).toBeEnabled()
    expect(getStoredUser()).toBeNull()
  })

  it('never shows raw JavaScript errors', async () => {
    vi.mocked(login).mockRejectedValue(new TypeError('boom'))
    const user = renderPage()

    await signInAs(user)

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong. Please try again.'),
    )
  })
})
