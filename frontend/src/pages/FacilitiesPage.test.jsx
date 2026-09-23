import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../App'
import { addFacility, deleteFacility, getFacilities, updateFacility } from '../services/adminFacilityService'
import { ApiError } from '../services/apiClient'
import { ALEX, renderWithProviders } from '../test/renderWithProviders'

vi.mock('../services/adminFacilityService', () => ({
  getFacilities: vi.fn(),
  addFacility: vi.fn(),
  updateFacility: vi.fn(),
  deleteFacility: vi.fn(),
}))

const seat = (seatId, seatNumber, floorId, extra = {}) => ({
  seat_id: seatId, seat_number: seatNumber, floor_id: floorId, is_active: true, active_ticket_count: 0, ...extra,
})

// GET /admin/facilities: Building A with two floors (seat 302 inactive); Building B inactive,
// with an active floor and an inactive one.
const FACILITIES = [
  {
    building_id: 1,
    building_name: 'Building A',
    is_active: true,
    active_ticket_count: 2,
    floors: [
      { floor_id: 1, floor_number: 1, building_id: 1, is_active: true, active_ticket_count: 0, seats: [seat(1, '101', 1)] },
      {
        floor_id: 3,
        floor_number: 3,
        building_id: 1,
        is_active: true,
        active_ticket_count: 2,
        seats: [seat(3, '301', 3, { active_ticket_count: 2 }), seat(8, '302', 3, { is_active: false })],
      },
    ],
  },
  {
    building_id: 2,
    building_name: 'Building B',
    is_active: false,
    active_ticket_count: 0,
    floors: [
      { floor_id: 4, floor_number: 1, building_id: 2, is_active: true, active_ticket_count: 0, seats: [] },
      { floor_id: 5, floor_number: 2, building_id: 2, is_active: false, active_ticket_count: 0, seats: [] },
    ],
  },
]

const ANNEX = { building_id: 9, building_name: 'Annex', is_active: true, active_ticket_count: 0 }

function renderPage({ width = 1280 } = {}) {
  const user = userEvent.setup()
  renderWithProviders(<App />, { route: '/admin/facilities', user: ALEX, width })
  return user
}

const details = (name = /^Building/) => screen.getByRole('region', { name })
const buildingList = () => screen.getByRole('list', { name: 'Buildings' })
const dialog = () => screen.getByRole('dialog')

async function openFloor(user, number) {
  await user.click(within(details()).getByRole('button', { name: new RegExp(`^Floor ${number},`) }))
  return screen.getByRole('group', { name: `Seats on Floor ${number}` })
}

beforeEach(() => {
  vi.mocked(getFacilities).mockReset().mockResolvedValue(FACILITIES)
  vi.mocked(addFacility).mockReset()
  vi.mocked(updateFacility).mockReset()
  vi.mocked(deleteFacility).mockReset()
})

describe('FacilitiesPage: browsing', () => {
  it('lists buildings beside the chosen one, with its floors and seats', async () => {
    const user = renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Facilities' })).toBeInTheDocument()
    await screen.findByRole('list', { name: 'Buildings' })

    const [first, second] = within(buildingList()).getAllByRole('button')
    expect(first).toHaveTextContent('Building A2 floors · 2 active tickets')
    expect(first).toHaveAttribute('aria-current', 'true')
    expect(second).toHaveTextContent('2 floors · 0 active tickets · Inactive')

    expect(within(details()).getByRole('heading', { level: 2 })).toHaveTextContent('Building A')
    expect(within(details()).getByRole('link', { name: '2 active tickets' })).toHaveAttribute('href', '/admin?building=1')
    expect(within(details()).getByRole('button', { name: 'Floor 3, 2 seats, 2 active tickets' })).toHaveTextContent(
      'Floor 32 seats · 2 active tickets',
    )

    const seats = await openFloor(user, 3)
    expect(within(seats).getByRole('button', { name: 'Seat 301, 2 active tickets' })).toHaveTextContent('301 · 2')
    expect(within(seats).getByRole('button', { name: 'Seat 302, inactive' })).toBeInTheDocument()
  })

  it('switches building from the list', async () => {
    const user = renderPage()
    await screen.findByRole('list', { name: 'Buildings' })

    await user.click(within(buildingList()).getByRole('button', { name: /^Building B/ }))

    expect(within(details()).getByRole('heading', { level: 2 })).toHaveTextContent('Building B')
    // The building's chip, and Floor 2's.
    expect(within(details()).getAllByText('Inactive')).toHaveLength(2)
    expect(within(details()).getByText('0 active tickets')).toBeInTheDocument()
    expect(within(details()).getByRole('button', { name: 'Reactivate Building B' })).toBeInTheDocument()
    // Its floor is active, but hidden while the building isn't.
    const seats = await openFloor(user, 1)
    expect(within(details()).getByText('Hidden while Building B is inactive.')).toBeInTheDocument()
    expect(within(seats).getByText('No seats yet.')).toBeInTheDocument()
    // An inactive floor says so itself, rather than blaming the building.
    await user.click(within(details()).getByRole('button', { name: 'Floor 2, inactive, 0 seats, 0 active tickets' }))
    expect(within(details()).getAllByText('Hidden while Building B is inactive.')).toHaveLength(1)
    expect(within(details()).getByRole('button', { name: 'Reactivate Floor 2' })).toBeInTheDocument()
  })

  it('uses a dropdown for the building on phones', async () => {
    const user = renderPage({ width: 375 })
    const select = await screen.findByRole('combobox', { name: 'Building' })
    expect(screen.queryByRole('list', { name: 'Buildings' })).not.toBeInTheDocument()

    await user.click(select)
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Building A', 'Building B (inactive)'])
    await user.click(screen.getByRole('option', { name: 'Building B (inactive)' }))

    expect(within(details()).getByRole('heading', { level: 2 })).toHaveTextContent('Building B')
  })

  it('shows a placeholder while loading', () => {
    vi.mocked(getFacilities).mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByLabelText('Loading facilities')).toBeInTheDocument()
  })

  it('explains a failed load and retries', async () => {
    vi.mocked(getFacilities)
      .mockRejectedValueOnce(new ApiError("Can't reach the server. Check your connection and try again.", { status: 0 }))
      .mockResolvedValue(FACILITIES)
    const user = renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server.")
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('list', { name: 'Buildings' })).toBeInTheDocument()
  })

  it('says when there are no buildings yet', async () => {
    vi.mocked(getFacilities).mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('No buildings yet. Add the first one to start.')).toBeInTheDocument()
  })
})

describe('FacilitiesPage: adding and renaming', () => {
  it('adds a building, then shows it', async () => {
    vi.mocked(addFacility).mockResolvedValue(ANNEX)
    const user = renderPage()
    await screen.findByRole('list', { name: 'Buildings' })

    await user.click(screen.getByRole('button', { name: 'Add building' }))
    expect(dialog()).toHaveAccessibleName('Add a building')
    // Checked before sending, like the API would.
    await user.click(within(dialog()).getByRole('button', { name: 'Add building' }))
    expect(within(dialog()).getByText('Enter a building name.')).toBeInTheDocument()
    expect(addFacility).not.toHaveBeenCalled()

    vi.mocked(getFacilities).mockResolvedValue([{ ...ANNEX, floors: [] }, ...FACILITIES])
    await user.type(within(dialog()).getByRole('textbox', { name: 'Building name' }), '  Annex ')
    await user.click(within(dialog()).getByRole('button', { name: 'Add building' }))

    expect(addFacility).toHaveBeenCalledWith('building', null, 'Annex')
    expect(await screen.findByText('Added Annex.')).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Annex' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(getFacilities).toHaveBeenCalledTimes(2)
  })

  it("shows the API's refusal on the field and keeps the dialog open", async () => {
    vi.mocked(addFacility).mockRejectedValue(new ApiError('There\'s already a building called building a', { status: 409 }))
    const user = renderPage()
    await screen.findByRole('list', { name: 'Buildings' })

    await user.click(screen.getByRole('button', { name: 'Add building' }))
    const field = within(dialog()).getByRole('textbox', { name: 'Building name' })
    await user.type(field, 'building a')
    await user.click(within(dialog()).getByRole('button', { name: 'Add building' }))

    expect(await within(dialog()).findByText("There's already a building called building a")).toBeInTheDocument()
    expect(field).toHaveAttribute('aria-invalid', 'true')
    // Typing again clears the error.
    await user.type(field, 'x')
    expect(field).toHaveAttribute('aria-invalid', 'false')
  })

  it('shows other failures in the dialog', async () => {
    vi.mocked(addFacility).mockRejectedValue(new ApiError('Something went wrong on our side. Please try again.', { status: 500 }))
    const user = renderPage()
    await screen.findByRole('list', { name: 'Buildings' })

    await user.click(screen.getByRole('button', { name: 'Add building' }))
    await user.type(within(dialog()).getByRole('textbox', { name: 'Building name' }), 'Annex')
    await user.click(within(dialog()).getByRole('button', { name: 'Add building' }))

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Something went wrong on our side.')
    await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('adds a floor, checking the number first', async () => {
    vi.mocked(addFacility).mockResolvedValue({ floor_id: 7, floor_number: -1, building_id: 1, is_active: true, active_ticket_count: 0 })
    const user = renderPage()
    await screen.findByRole('list', { name: 'Buildings' })

    await user.click(screen.getByRole('button', { name: 'Add a floor to Building A' }))
    expect(dialog()).toHaveAccessibleName('Add a floor to Building A')
    const field = within(dialog()).getByRole('textbox', { name: 'Floor number' })
    await user.type(field, '201')
    await user.click(within(dialog()).getByRole('button', { name: 'Add floor' }))
    expect(within(dialog()).getByText('Use a floor from -10 to 200.')).toBeInTheDocument()

    await user.clear(field)
    await user.type(field, '-1')
    await user.click(within(dialog()).getByRole('button', { name: 'Add floor' }))

    expect(addFacility).toHaveBeenCalledWith('floor', 1, -1)
    expect(await screen.findByText('Added Floor -1 to Building A.')).toBeInTheDocument()
  })

  it('adds a seat to a floor', async () => {
    vi.mocked(addFacility).mockResolvedValue(seat(20, '303', 3))
    const user = renderPage()
    await screen.findByRole('list', { name: 'Buildings' })

    const seats = await openFloor(user, 3)
    await user.click(within(seats).getByRole('button', { name: 'Add a seat to Floor 3' }))
    await user.type(within(dialog()).getByRole('textbox', { name: 'Seat number' }), '303')
    await user.click(within(dialog()).getByRole('button', { name: 'Add seat' }))

    expect(addFacility).toHaveBeenCalledWith('seat', 3, '303')
    expect(await screen.findByText('Added Seat 303 to Floor 3.')).toBeInTheDocument()
  })

  it('renames a building, starting from its current name', async () => {
    vi.mocked(updateFacility).mockResolvedValue({ ...FACILITIES[0], building_name: 'HQ' })
    const user = renderPage()
    await screen.findByRole('list', { name: 'Buildings' })

    await user.click(within(details()).getByRole('button', { name: 'Rename Building A' }))
    expect(dialog()).toHaveAccessibleName('Rename Building A')
    const field = within(dialog()).getByRole('textbox', { name: 'Building name' })
    expect(field).toHaveValue('Building A')
    await user.clear(field)
    await user.type(field, 'HQ')
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }))

    expect(updateFacility).toHaveBeenCalledWith('building', 1, { building_name: 'HQ' })
    expect(await screen.findByText('Saved as HQ.')).toBeInTheDocument()
  })

  it('closes without saving when nothing changed', async () => {
    const user = renderPage()
    await screen.findByRole('list', { name: 'Buildings' })

    await openFloor(user, 3)
    await user.click(within(details()).getByRole('button', { name: 'Renumber Floor 3' }))
    expect(within(dialog()).getByRole('textbox', { name: 'Floor number' })).toHaveValue('3')
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(updateFacility).not.toHaveBeenCalled()
  })

  it('renumbers a seat from its menu', async () => {
    vi.mocked(updateFacility).mockResolvedValue(seat(3, '301A', 3))
    const user = renderPage()
    await screen.findByRole('list', { name: 'Buildings' })

    const seats = await openFloor(user, 3)
    await user.click(within(seats).getByRole('button', { name: /^Seat 301/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Renumber' }))
    const field = within(dialog()).getByRole('textbox', { name: 'Seat number' })
    await user.clear(field)
    await user.type(field, '301A')
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }))

    expect(updateFacility).toHaveBeenCalledWith('seat', 3, { seat_number: '301A' })
  })
})

describe('FacilitiesPage: deactivating and deleting', () => {
  it('deactivates a seat after explaining what happens to its tickets', async () => {
    vi.mocked(updateFacility).mockResolvedValue(seat(3, '301', 3, { is_active: false, active_ticket_count: 2 }))
    const user = renderPage()
    await screen.findByRole('list', { name: 'Buildings' })

    const seats = await openFloor(user, 3)
    await user.click(within(seats).getByRole('button', { name: /^Seat 301/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Deactivate' }))

    expect(dialog()).toHaveAccessibleName('Deactivate Seat 301?')
    expect(dialog()).toHaveTextContent(
      "Employees won't be able to pick it for new tickets. Its 2 active tickets keep this location. You can reactivate it later.",
    )
    await user.click(within(dialog()).getByRole('button', { name: 'Deactivate' }))

    expect(updateFacility).toHaveBeenCalledWith('seat', 3, { is_active: false })
    expect(await screen.findByText("Seat 301 is inactive. Employees can't pick it for new tickets.")).toBeInTheDocument()
  })

  it('deactivates a building, after a change of mind', async () => {
    vi.mocked(updateFacility).mockResolvedValue({ ...FACILITIES[0], is_active: false })
    const user = renderPage()
    await screen.findByRole('list', { name: 'Buildings' })

    await user.click(within(details()).getByRole('button', { name: 'Deactivate Building A' }))
    expect(dialog()).toHaveTextContent(
      "Employees won't be able to pick it, or any floor or seat in it, for new tickets. Its 2 active tickets keep this location.",
    )
    await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(updateFacility).not.toHaveBeenCalled()

    await user.click(within(details()).getByRole('button', { name: 'Deactivate Building A' }))
    await user.click(within(dialog()).getByRole('button', { name: 'Deactivate' }))

    expect(updateFacility).toHaveBeenCalledWith('building', 1, { is_active: false })
    const notice = await screen.findByText("Building A is inactive. Employees can't pick it for new tickets.")
    await user.click(within(notice.closest('[role="alert"]')).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(notice).not.toBeInTheDocument())
  })

  it('reactivates an inactive seat and building', async () => {
    vi.mocked(updateFacility).mockImplementation((kind, id) => Promise.resolve(
      kind === 'seat' ? seat(id, '302', 3) : { ...FACILITIES[1], is_active: true },
    ))
    const user = renderPage()
    await screen.findByRole('list', { name: 'Buildings' })

    const seats = await openFloor(user, 3)
    await user.click(within(seats).getByRole('button', { name: 'Seat 302, inactive' }))
    await user.click(screen.getByRole('menuitem', { name: 'Reactivate' }))
    expect(dialog()).toHaveTextContent('Employees can pick it for new tickets again.')
    await user.click(within(dialog()).getByRole('button', { name: 'Reactivate' }))
    expect(await screen.findByText('Seat 302 is active again.')).toBeInTheDocument()

    await user.click(within(buildingList()).getByRole('button', { name: /^Building B/ }))
    await user.click(within(details()).getByRole('button', { name: 'Reactivate Building B' }))
    await user.click(within(dialog()).getByRole('button', { name: 'Reactivate' }))

    expect(updateFacility.mock.calls).toEqual([
      ['seat', 8, { is_active: true }],
      ['building', 2, { is_active: true }],
    ])
  })

  it('deactivates a floor with no tickets', async () => {
    vi.mocked(updateFacility).mockResolvedValue({ ...FACILITIES[0].floors[0], is_active: false })
    const user = renderPage()
    await screen.findByRole('list', { name: 'Buildings' })

    await openFloor(user, 1)
    await user.click(within(details()).getByRole('button', { name: 'Deactivate Floor 1' }))
    expect(dialog()).toHaveTextContent(
      "Employees won't be able to pick it, or any seat on it, for new tickets. You can reactivate it later.",
    )
    await user.click(within(dialog()).getByRole('button', { name: 'Deactivate' }))

    expect(updateFacility).toHaveBeenCalledWith('floor', 1, { is_active: false })
  })

  it('shows a generic message when something unexpected fails', async () => {
    vi.mocked(deleteFacility).mockRejectedValue(new Error('boom'))
    vi.mocked(addFacility).mockRejectedValue(new Error('boom'))
    const user = renderPage()
    await screen.findByRole('list', { name: 'Buildings' })

    await user.click(within(details()).getByRole('button', { name: 'Delete Building A' }))
    await user.click(within(dialog()).getByRole('button', { name: 'Delete' }))
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.')
    expect(within(dialog()).queryByRole('button', { name: 'Deactivate instead' })).not.toBeInTheDocument()
    await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Add building' }))
    await user.type(within(dialog()).getByRole('textbox', { name: 'Building name' }), 'Annex')
    await user.click(within(dialog()).getByRole('button', { name: 'Add building' }))
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.')
  })

  it('deletes an unused seat', async () => {
    vi.mocked(deleteFacility).mockResolvedValue(null)
    const user = renderPage()
    await screen.findByRole('list', { name: 'Buildings' })

    const seats = await openFloor(user, 1)
    await user.click(within(seats).getByRole('button', { name: 'Seat 101' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(dialog()).toHaveAccessibleName('Delete Seat 101?')
    await user.click(within(dialog()).getByRole('button', { name: 'Delete' }))

    expect(deleteFacility).toHaveBeenCalledWith('seat', 1)
    expect(await screen.findByText('Deleted Seat 101.')).toBeInTheDocument()
  })

  it('offers to deactivate a floor that tickets use instead of deleting it', async () => {
    vi.mocked(deleteFacility).mockRejectedValue(
      new ApiError("Floor 3 has 2 tickets, so it can't be deleted. Deactivate it instead.", { status: 409 }),
    )
    vi.mocked(updateFacility).mockResolvedValue({ ...FACILITIES[0].floors[1], is_active: false })
    const user = renderPage()
    await screen.findByRole('list', { name: 'Buildings' })

    await openFloor(user, 3)
    await user.click(within(details()).getByRole('button', { name: 'Delete Floor 3' }))
    await user.click(within(dialog()).getByRole('button', { name: 'Delete' }))

    const alert = await within(dialog()).findByRole('alert')
    expect(alert).toHaveTextContent("Floor 3 has 2 tickets, so it can't be deleted. Deactivate it instead.")
    await user.click(within(alert).getByRole('button', { name: 'Deactivate instead' }))

    await waitFor(() => expect(dialog()).toHaveAccessibleName('Deactivate Floor 3?'))
    expect(dialog()).toHaveTextContent("Employees won't be able to pick it, or any seat on it, for new tickets.")
    await user.click(within(dialog()).getByRole('button', { name: 'Deactivate' }))

    expect(updateFacility).toHaveBeenCalledWith('floor', 3, { is_active: false })
    expect(await screen.findByText("Floor 3 is inactive. Employees can't pick it for new tickets.")).toBeInTheDocument()
  })

  it("doesn't offer to deactivate what's already inactive", async () => {
    vi.mocked(deleteFacility).mockRejectedValue(
      new ApiError('Building B still has 1 floor. Delete them first, or deactivate it instead.', { status: 409 }),
    )
    const user = renderPage()
    await screen.findByRole('list', { name: 'Buildings' })

    await user.click(within(buildingList()).getByRole('button', { name: /^Building B/ }))
    await user.click(within(details()).getByRole('button', { name: 'Delete Building B' }))
    await user.click(within(dialog()).getByRole('button', { name: 'Delete' }))

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Building B still has 1 floor.')
    expect(within(dialog()).queryByRole('button', { name: 'Deactivate instead' })).not.toBeInTheDocument()
  })

  it('goes back to the first building after deleting the chosen one', async () => {
    vi.mocked(getFacilities).mockResolvedValue([{ ...ANNEX, floors: [] }, ...FACILITIES])
    vi.mocked(deleteFacility).mockResolvedValue(null)
    const user = renderPage()
    await screen.findByRole('list', { name: 'Buildings' })
    await user.click(within(buildingList()).getByRole('button', { name: /^Building A/ }))

    vi.mocked(getFacilities).mockResolvedValue(FACILITIES.slice(1))
    await user.click(within(details()).getByRole('button', { name: 'Delete Building A' }))
    await user.click(within(dialog()).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('Deleted Building A.')).toBeInTheDocument()
    await waitFor(() => expect(within(details()).getByRole('heading', { level: 2 })).toHaveTextContent('Building B'))
  })
})
