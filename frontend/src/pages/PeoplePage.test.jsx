import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../App'
import { listAllTickets } from '../services/adminTicketService'
import { changeRole, listUsers } from '../services/adminUserService'
import { ApiError } from '../services/apiClient'
import { makeAdminTicket, USERS } from '../test/fixtures'
import { ALEX, renderWithProviders } from '../test/renderWithProviders'

vi.mock('../services/adminUserService', () => ({ listUsers: vi.fn(), changeRole: vi.fn() }))
vi.mock('../services/adminTicketService', async (importOriginal) => ({
  ...(await importOriginal()),
  listAllTickets: vi.fn(),
}))

/**
 * Active tickets (view=active): Sam's three, matching his active_ticket_count, two of
 * them reported by Jane. The resolved one isn't "active" in the people counts.
 */
const TICKETS = [
  makeAdminTicket({ ticket_id: 7, title: 'Lobby lights out', status: 'open', created_by_user_id: 2, assigned_to_user_id: 4 }),
  makeAdminTicket({ ticket_id: 5, title: 'Printer jam', status: 'in_progress', assigned_to_user_id: 4 }),
  makeAdminTicket({ ticket_id: 11, title: 'Door sticks', status: 'blocked', assigned_to_user_id: 4 }),
  makeAdminTicket({ ticket_id: 12, title: 'Old lamp', status: 'resolved', assigned_to_user_id: 4 }),
]

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
// Each row's name, without the avatar's initials.
const names = () =>
  within(table())
    .getAllByRole('row')
    .slice(1)
    .map((r) => USERS.find((u) => r.textContent.includes(u.full_name)).full_name)
const lastFilters = () => vi.mocked(listUsers).mock.calls.at(-1)[0]
const panel = (name) => screen.getByRole('region', { name })

beforeEach(() => {
  vi.mocked(listUsers).mockReset().mockImplementation(fakeApi)
  vi.mocked(listAllTickets).mockReset().mockResolvedValue(TICKETS)
  vi.mocked(changeRole).mockReset()
})

describe('PeoplePage: the list', () => {
  it('shows everyone by name with their role, active tickets and a change button', async () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'People' })).toBeInTheDocument()
    await screen.findByRole('table')

    expect(names()).toEqual(['Alex Admin', 'Jane Doe', 'Kim Fixit', 'Sam Tech'])
    expect(lastFilters()).toEqual({})
    expect(listAllTickets).toHaveBeenCalledWith({ view: 'active' }, expect.anything())

    expect(row('Jane Doe')).toHaveTextContent('Employee')
    expect(await within(row('Jane Doe')).findByText('2 reported')).toBeInTheDocument()
    expect(within(row('Jane Doe')).getByRole('button', { name: 'Make engineer' })).toBeInTheDocument()

    expect(row('Sam Tech')).toHaveTextContent('Engineer')
    expect(row('Sam Tech')).toHaveTextContent('3 assigned')
    expect(within(row('Sam Tech')).getByRole('button', { name: 'Make employee' })).toBeInTheDocument()
    expect(row('Kim Fixit')).toHaveTextContent('None')

    // Admin accounts can't be changed here.
    expect(row('Alex Admin')).toHaveTextContent('Facility Admin')
    expect(row('Alex Admin')).toHaveTextContent("Can't change")
    expect(within(row('Alex Admin')).queryByRole('button', { name: /^Make/ })).not.toBeInTheDocument()
    expect(screen.getByText('4 of 4 people')).toBeInTheDocument()
  })

  it('filters by role on the page, with a count on each option', async () => {
    const user = renderPage()
    await screen.findByRole('table')

    expect(screen.getByRole('button', { name: 'Everyone 4' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Employees 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Admins 1' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Engineers 2' }))
    expect(names()).toEqual(['Kim Fixit', 'Sam Tech'])
    expect(screen.getByText('2 of 4 people')).toBeInTheDocument()
    // The role filter doesn't need another request.
    expect(listUsers).toHaveBeenCalledTimes(1)

    // Clicking the selected filter again keeps it.
    await user.click(screen.getByRole('button', { name: 'Engineers 2' }))
    expect(screen.getByRole('button', { name: 'Engineers 2' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Everyone 4' }))
    expect(names()).toHaveLength(4)
  })

  it('searches once typing pauses, and the counts follow', async () => {
    const user = renderPage()
    await screen.findByRole('table')

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'jane')

    await waitFor(() => expect(names()).toEqual(['Jane Doe']), { timeout: 3000 })
    expect(lastFilters()).toEqual({ q: 'jane' })
    expect(screen.getByRole('button', { name: 'Everyone 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Engineers 0' })).toBeInTheDocument()
    expect(screen.getByText('1 of 1 person matching "jane"')).toBeInTheDocument()
  })

  it('offers to clear filters when no one matches', async () => {
    const user = renderPage()
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Admins 1' }))
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
})

describe('PeoplePage: the selected person', () => {
  it('starts on the first person who can be changed, with their reported tickets', async () => {
    renderPage()
    await screen.findByRole('table')

    expect(within(row('Jane Doe')).getByRole('button', { name: 'Jane Doe' })).toHaveAttribute('aria-pressed', 'true')
    const jane = panel('Jane Doe')
    expect(within(jane).getByRole('link', { name: 'jane@acme.inc' })).toHaveAttribute('href', 'mailto:jane@acme.inc')

    const tickets = await within(jane).findByRole('list', { name: 'Their open tickets' })
    const links = within(tickets).getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/admin/tickets/5', '/admin/tickets/11'])
    expect(links[0]).toHaveTextContent('Printer jam')
    expect(links[0]).toHaveTextContent('In Progress')
    expect(jane).toHaveTextContent('They keep the tickets they reported.')
    expect(jane).toHaveTextContent('Changing their role signs them out.')
    expect(within(jane).getByRole('button', { name: 'Make engineer' })).toBeInTheDocument()
  })

  it("shows an engineer's assigned tickets and a way to the dashboard", async () => {
    const user = renderPage()
    await screen.findByRole('table')

    await user.click(within(row('Sam Tech')).getByRole('button', { name: 'Sam Tech' }))

    const sam = panel('Sam Tech')
    const tickets = await within(sam).findByRole('list', { name: 'Assigned, active' })
    // Resolved tickets aren't active.
    expect(within(tickets).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual([
      '/admin/tickets/7',
      '/admin/tickets/5',
      '/admin/tickets/11',
    ])
    expect(within(sam).getByRole('link', { name: 'Open in admin dashboard' })).toHaveAttribute('href', '/admin?engineer=4')
    expect(sam).toHaveTextContent('Reassign their 3 active tickets first.')
    expect(within(row('Jane Doe')).getByRole('button', { name: 'Jane Doe' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('says when an engineer has nothing active', async () => {
    const user = renderPage()
    await screen.findByRole('table')

    await user.click(row('Kim Fixit'))

    const kim = panel('Kim Fixit')
    expect(await within(kim).findByText('Nothing active right now.')).toBeInTheDocument()
    expect(kim).toHaveTextContent("They'll no longer appear in the assign list.")
  })

  it("can't change an admin", async () => {
    const user = renderPage()
    await screen.findByRole('table')

    await user.click(within(row('Alex Admin')).getByRole('button', { name: 'Alex Admin' }))

    const alex = panel('Alex Admin')
    expect(alex).toHaveTextContent("Facility Admin accounts can't be changed here.")
    expect(within(alex).queryByRole('button', { name: /^Make/ })).not.toBeInTheDocument()
  })

  it("explains when their tickets can't load, and retries", async () => {
    vi.mocked(listAllTickets).mockRejectedValueOnce(new ApiError('Server error', { status: 500 }))
    const user = renderPage()
    await screen.findByRole('table')

    const jane = panel('Jane Doe')
    expect(await within(jane).findByText(/Couldn't load their tickets\./)).toBeInTheDocument()
    await user.click(within(jane).getByRole('button', { name: 'Try again' }))
    expect(await within(jane).findByRole('list', { name: 'Their open tickets' })).toBeInTheDocument()
  })
})

describe('PeoplePage: on phones', () => {
  it('shows compact cards instead of the table and panel', async () => {
    const user = renderPage({ width: 375 })
    const card = (await screen.findByText('Sam Tech')).closest('li')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Sam Tech' })).not.toBeInTheDocument()
    expect(within(card).getByText('sam@acme.inc')).toBeInTheDocument()
    expect(card).toHaveTextContent('Engineer')
    expect(card).toHaveTextContent('3 assigned')
    expect(screen.getByText('Alex Admin').closest('li')).toHaveTextContent('Facility Admin')

    await user.click(within(card).getByRole('button', { name: 'Make Sam Tech an employee' }))
    expect(screen.getByRole('dialog', { name: 'Move Sam Tech back to employee?' })).toBeInTheDocument()
  })
})

describe('PeoplePage: changing a role', () => {
  it('confirms, explains the sign-out, then promotes and refreshes', async () => {
    vi.mocked(changeRole).mockResolvedValue({ ...USERS[1], role: 'engineer' })
    const user = renderPage()
    await screen.findByRole('table')

    await user.click(within(row('Jane Doe')).getByRole('button', { name: 'Make engineer' }))

    const dialog = screen.getByRole('dialog', { name: 'Make Jane Doe an engineer?' })
    expect(dialog).toHaveTextContent("They can then be assigned tickets. They'll be signed out and need to sign in again.")
    expect(changeRole).not.toHaveBeenCalled()
    const loads = vi.mocked(listUsers).mock.calls.length
    const ticketLoads = vi.mocked(listAllTickets).mock.calls.length

    await user.click(within(dialog).getByRole('button', { name: 'Make engineer' }))

    expect(changeRole).toHaveBeenCalledWith(1, 'engineer')
    expect(await screen.findByText("Jane Doe is now an engineer. They'll need to sign in again.")).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(vi.mocked(listUsers).mock.calls.length).toBe(loads + 1)
    expect(vi.mocked(listAllTickets).mock.calls.length).toBe(ticketLoads + 1)

    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByText(/is now an engineer/)).not.toBeInTheDocument())
  })

  it("changes the selected person's role from the panel", async () => {
    vi.mocked(changeRole).mockResolvedValue({ ...USERS[2], role: 'employee' })
    const user = renderPage()
    await screen.findByRole('table')

    await user.click(row('Kim Fixit'))
    await user.click(within(panel('Kim Fixit')).getByRole('button', { name: 'Make employee' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Make employee' }))

    expect(changeRole).toHaveBeenCalledWith(6, 'employee')
    expect(await screen.findByText("Kim Fixit is now an employee. They'll need to sign in again.")).toBeInTheDocument()
  })

  it('does nothing when cancelled', async () => {
    const user = renderPage()
    await screen.findByRole('table')

    await user.click(within(row('Kim Fixit')).getByRole('button', { name: 'Make employee' }))
    const dialog = screen.getByRole('dialog', { name: 'Move Kim Fixit back to employee?' })
    expect(dialog).toHaveTextContent("They won't be able to take tickets any more.")
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(changeRole).not.toHaveBeenCalled()
    // The role only changes once confirmed and saved.
    expect(row('Kim Fixit')).toHaveTextContent('Engineer')
    expect(within(row('Kim Fixit')).getByRole('button', { name: 'Make employee' })).toBeInTheDocument()
  })

  it("explains a refused demotion and links to the engineer's tickets", async () => {
    vi.mocked(changeRole).mockRejectedValue(
      new ApiError('Sam Tech still has 3 active tickets. Reassign them first.', { status: 409 }),
    )
    const user = renderPage()
    await screen.findByRole('table')

    await user.click(within(row('Sam Tech')).getByRole('button', { name: 'Make employee' }))
    const dialog = screen.getByRole('dialog', { name: 'Move Sam Tech back to employee?' })
    await user.click(within(dialog).getByRole('button', { name: 'Make employee' }))

    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent('Sam Tech still has 3 active tickets. Reassign them first.')
    expect(within(alert).getByRole('link', { name: 'See their tickets' })).toHaveAttribute('href', '/admin?engineer=4')

    // Trying again starts fresh, without the old error.
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(within(row('Sam Tech')).getByRole('button', { name: 'Make employee' }))
    expect(within(screen.getByRole('dialog')).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows other refusals without a tickets link, and never a raw error', async () => {
    vi.mocked(changeRole)
      .mockRejectedValueOnce(new ApiError('Jane Doe is already an engineer', { status: 409 }))
      .mockRejectedValueOnce(new TypeError('boom'))
    const user = renderPage()
    await screen.findByRole('table')

    await user.click(within(row('Jane Doe')).getByRole('button', { name: 'Make engineer' }))
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

    await user.click(within(row('Jane Doe')).getByRole('button', { name: 'Make engineer' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Make engineer' }))

    expect(within(dialog).getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    finish({ ...USERS[1], role: 'engineer' })
    expect(await screen.findByText(/Jane Doe is now an engineer/)).toBeInTheDocument()
  })
})
