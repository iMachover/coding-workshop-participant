import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../App'
import { changeRole, listUsers } from '../services/adminUserService'
import { ApiError } from '../services/apiClient'
import { USERS } from '../test/fixtures'
import { ALEX, renderWithProviders } from '../test/renderWithProviders'

vi.mock('../services/adminUserService', () => ({ listUsers: vi.fn(), changeRole: vi.fn() }))

/** Serve USERS like the API would for the given filters. */
function fakeApi(filters = {}) {
  let result = USERS
  if (filters.role) result = result.filter((u) => u.role === filters.role)
  if (filters.q) {
    const q = filters.q.toLowerCase()
    result = result.filter((u) => u.full_name.toLowerCase().includes(q) || u.email.includes(q))
  }
  return Promise.resolve(result)
}

function renderPage({ width = 1280 } = {}) {
  const user = userEvent.setup()
  renderWithProviders(<App />, { route: '/admin/people', user: ALEX, width })
  return user
}

const table = () => screen.getByRole('table', { name: 'People' })
const row = (name) => within(table()).getAllByRole('row').find((r) => within(r).queryByText(name))
const names = () => within(table()).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent)
const lastFilters = () => vi.mocked(listUsers).mock.calls.at(-1)[0]

async function pickRole(user, name, role) {
  await user.click(within(row(name)).getByRole('combobox', { name: 'Role' }))
  await user.click(screen.getByRole('option', { name: role }))
}

beforeEach(() => {
  vi.mocked(listUsers).mockReset().mockImplementation(fakeApi)
  vi.mocked(changeRole).mockReset()
})

describe('PeoplePage: the list', () => {
  it('shows everyone by name with their role and tickets', async () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'People' })).toBeInTheDocument()
    await screen.findByRole('table')

    expect(names()).toEqual(['Alex Admin', 'Jane Doe', 'Kim Fixit', 'Sam Tech'])
    expect(lastFilters()).toEqual({})
    expect(within(row('Jane Doe')).getByRole('combobox', { name: 'Role' })).toHaveTextContent('Employee')
    expect(within(row('Sam Tech')).getByRole('combobox', { name: 'Role' })).toHaveTextContent('Engineer')
    // Admin accounts can't be changed here.
    expect(within(row('Alex Admin')).queryByRole('combobox')).not.toBeInTheDocument()
    expect(row('Alex Admin')).toHaveTextContent('Facility Admin')
    // An engineer's tickets link to the dashboard, filtered to them.
    expect(within(row('Sam Tech')).getByRole('link', { name: 'Sam Tech: 3 active tickets' })).toHaveAttribute(
      'href',
      '/admin?engineer=4',
    )
    expect(within(row('Kim Fixit')).queryByRole('link')).not.toBeInTheDocument()
  })

  it('filters by role', async () => {
    const user = renderPage()
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Engineers' }))
    await waitFor(() => expect(names()).toEqual(['Kim Fixit', 'Sam Tech']))
    expect(lastFilters()).toEqual({ role: 'engineer' })

    // Clicking the selected filter again keeps it.
    await user.click(screen.getByRole('button', { name: 'Engineers' }))
    expect(screen.getByRole('button', { name: 'Engineers' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Everyone' }))
    await waitFor(() => expect(names()).toHaveLength(4))
  })

  it('searches once typing pauses', async () => {
    const user = renderPage()
    await screen.findByRole('table')

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'jane')

    await waitFor(() => expect(names()).toEqual(['Jane Doe']), { timeout: 3000 })
    expect(lastFilters()).toEqual({ q: 'jane' })
  })

  it('offers to clear filters when no one matches', async () => {
    const user = renderPage()
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Admins' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'zzz')
    expect(await screen.findByText('No one matches these filters.', {}, { timeout: 3000 })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(names()).toHaveLength(4), { timeout: 3000 })
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('')
  })

  it('shows a placeholder while loading', () => {
    vi.mocked(listUsers).mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByLabelText('Loading people')).toBeInTheDocument()
  })

  it('explains a failed load and retries', async () => {
    vi.mocked(listUsers)
      .mockRejectedValueOnce(new ApiError("Can't reach the server. Check your connection and try again.", { status: 0 }))
      .mockImplementation(fakeApi)
    const user = renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server.")
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  it('shows cards instead of a table on phones', async () => {
    renderPage({ width: 375 })
    const card = (await screen.findByText('Sam Tech')).closest('li')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(within(card).getByText('sam@acme.inc')).toBeInTheDocument()
    expect(within(card).getByRole('combobox', { name: 'Role' })).toHaveTextContent('Engineer')
    expect(within(card).getByRole('link', { name: 'Sam Tech: 3 active tickets' })).toBeInTheDocument()
  })
})

describe('PeoplePage: changing a role', () => {
  it('confirms, explains the sign-out, then promotes and refreshes', async () => {
    vi.mocked(changeRole).mockResolvedValue({ ...USERS[1], role: 'engineer' })
    const user = renderPage()
    await screen.findByRole('table')

    await pickRole(user, 'Jane Doe', 'Engineer')

    const dialog = screen.getByRole('dialog', { name: 'Make Jane Doe an engineer?' })
    expect(dialog).toHaveTextContent("They can then be assigned tickets. They'll be signed out and need to sign in again.")
    expect(changeRole).not.toHaveBeenCalled()
    const loads = vi.mocked(listUsers).mock.calls.length

    await user.click(within(dialog).getByRole('button', { name: 'Make engineer' }))

    expect(changeRole).toHaveBeenCalledWith(1, 'engineer')
    expect(await screen.findByText("Jane Doe is now an engineer. They'll need to sign in again.")).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(vi.mocked(listUsers).mock.calls.length).toBe(loads + 1)

    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByText(/is now an engineer/)).not.toBeInTheDocument())
  })

  it('does nothing when cancelled', async () => {
    const user = renderPage()
    await screen.findByRole('table')

    await pickRole(user, 'Kim Fixit', 'Employee')
    const dialog = screen.getByRole('dialog', { name: 'Move Kim Fixit back to employee?' })
    expect(dialog).toHaveTextContent("They won't be able to take tickets any more.")
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(changeRole).not.toHaveBeenCalled()
    // The role only changes once confirmed and saved.
    expect(within(row('Kim Fixit')).getByRole('combobox', { name: 'Role' })).toHaveTextContent('Engineer')
  })

  it('explains a refused demotion and links to the engineer\'s tickets', async () => {
    vi.mocked(changeRole).mockRejectedValue(
      new ApiError('Sam Tech still has 3 active tickets. Reassign them first.', { status: 409 }),
    )
    const user = renderPage()
    await screen.findByRole('table')

    await pickRole(user, 'Sam Tech', 'Employee')
    const dialog = screen.getByRole('dialog', { name: 'Move Sam Tech back to employee?' })
    await user.click(within(dialog).getByRole('button', { name: 'Make employee' }))

    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent('Sam Tech still has 3 active tickets. Reassign them first.')
    expect(within(alert).getByRole('link', { name: 'See their tickets' })).toHaveAttribute('href', '/admin?engineer=4')

    // Trying again starts fresh, without the old error.
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await pickRole(user, 'Sam Tech', 'Employee')
    expect(within(screen.getByRole('dialog')).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows other refusals without a tickets link, and never a raw error', async () => {
    vi.mocked(changeRole)
      .mockRejectedValueOnce(new ApiError('Jane Doe is already an engineer', { status: 409 }))
      .mockRejectedValueOnce(new TypeError('boom'))
    const user = renderPage()
    await screen.findByRole('table')

    await pickRole(user, 'Jane Doe', 'Engineer')
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Make engineer' }))
    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent('Jane Doe is already an engineer')
    expect(within(alert).queryByRole('link')).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Make engineer' }))
    await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent('Something went wrong. Please try again.'))
  })

  it('disables the dialog while saving', async () => {
    let finish
    vi.mocked(changeRole).mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const user = renderPage()
    await screen.findByRole('table')

    await pickRole(user, 'Jane Doe', 'Engineer')
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Make engineer' }))

    expect(within(dialog).getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    finish({ ...USERS[1], role: 'engineer' })
    expect(await screen.findByText(/Jane Doe is now an engineer/)).toBeInTheDocument()
  })

  it('confirms a move back to employee', async () => {
    vi.mocked(changeRole).mockResolvedValue({ ...USERS[2], role: 'employee' })
    const user = renderPage()
    await screen.findByRole('table')

    await pickRole(user, 'Kim Fixit', 'Employee')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Make employee' }))

    expect(changeRole).toHaveBeenCalledWith(6, 'employee')
    expect(await screen.findByText("Kim Fixit is now an employee. They'll need to sign in again.")).toBeInTheDocument()
  })
})
