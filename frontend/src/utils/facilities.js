/**
 * Buildings, floors and seats as Facility Admins manage them. The rules mirror the API
 * (schemas.py BuildingName, FloorNumber, SeatNumber) so most mistakes are caught before
 * sending; the API still has the final say (e.g. duplicates are a 409).
 */

/** Per level: the field the API expects, how the form asks for it, and its limits. */
export const FACILITY_KINDS = {
  building: {
    noun: 'building',
    field: 'building_name',
    idKey: 'building_id',
    label: 'Building name',
    hint: 'Up to 100 characters.',
  },
  floor: {
    noun: 'floor',
    field: 'floor_number',
    idKey: 'floor_id',
    label: 'Floor number',
    hint: 'From -10 to 200. Basements are negative.',
  },
  seat: {
    noun: 'seat',
    field: 'seat_number',
    idKey: 'seat_id',
    label: 'Seat number',
    hint: 'Up to 20 characters, e.g. 12A.',
  },
}

const MIN_FLOOR = -10
const MAX_FLOOR = 200
const MAX_LENGTH = { building: 100, seat: 20 }

/**
 * How an item is named in the UI, matching the create-ticket dropdowns and the API's
 * messages: "Building A", "Floor 3", "Seat 301".
 * @param {'building'|'floor'|'seat'} kind
 * @param {object} item
 * @returns {string}
 */
export function facilityName(kind, item) {
  if (kind === 'building') return item.building_name
  if (kind === 'floor') return `Floor ${item.floor_number}`
  return `Seat ${item.seat_number}`
}

/**
 * The item's current name or number, as text for the rename form.
 * @param {'building'|'floor'|'seat'} kind
 * @param {object} item
 * @returns {string}
 */
export function facilityValue(kind, item) {
  return String(item[FACILITY_KINDS[kind].field])
}

/**
 * Check what was typed and turn it into what the API expects.
 * @param {'building'|'floor'|'seat'} kind
 * @param {string} text
 * @returns {{value: string|number|null, problem: string}} problem is '' when it's fine
 */
export function parseFacilityValue(kind, text) {
  const trimmed = text.trim()
  if (kind === 'floor') {
    if (!/^-?\d+$/.test(trimmed)) return { value: null, problem: 'Enter a whole number, like 3 or -1.' }
    const number = Number(trimmed)
    if (number < MIN_FLOOR || number > MAX_FLOOR) {
      return { value: null, problem: `Use a floor from ${MIN_FLOOR} to ${MAX_FLOOR}.` }
    }
    return { value: number, problem: '' }
  }
  if (!trimmed) return { value: null, problem: `Enter a ${FACILITY_KINDS[kind].label.toLowerCase()}.` }
  if (trimmed.length > MAX_LENGTH[kind]) return { value: null, problem: `Use ${MAX_LENGTH[kind]} characters or fewer.` }
  return { value: trimmed, problem: '' }
}

/**
 * "1 active ticket", "3 active tickets".
 * @param {number} count
 * @returns {string}
 */
export function activeTicketsText(count) {
  return `${count} active ${count === 1 ? 'ticket' : 'tickets'}`
}

/**
 * Why an active item is still hidden from employees: its building (or floor) is inactive.
 * @param {object} building
 * @param {object} [floor] set for a seat
 * @returns {string} '' when nothing above it is inactive
 */
export function hiddenByParent(building, floor) {
  if (!building.is_active) return `Hidden while ${building.building_name} is inactive.`
  if (floor && !floor.is_active) return `Hidden while Floor ${floor.floor_number} is inactive.`
  return ''
}

/**
 * Building filter options for staff ticket lists, as [id, label] pairs. Inactive
 * buildings stay in the list (their tickets still exist), marked as such.
 * @param {{building_id: number, building_name: string, is_active: boolean}[]} buildings
 * @returns {[string, string][]}
 */
export function buildingFilterOptions(buildings) {
  return buildings.map((b) => [String(b.building_id), b.is_active ? b.building_name : `${b.building_name} (inactive)`])
}
