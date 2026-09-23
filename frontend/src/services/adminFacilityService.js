import { api } from './apiClient'
import { FACILITY_KINDS } from '../utils/facilities'

/**
 * Facility Admin routes for buildings, floors and seats. Admins only; the API answers
 * 403 for other roles. `kind` is 'building', 'floor' or 'seat'.
 */

const COLLECTION = { building: 'buildings', floor: 'floors', seat: 'seats' }

// Where a new item goes: buildings at the top, floors under a building, seats under a floor.
const ADD_PATH = {
  building: () => '/admin/buildings',
  floor: (buildingId) => `/admin/buildings/${Number(buildingId)}/floors`,
  seat: (floorId) => `/admin/floors/${Number(floorId)}/seats`,
}

/**
 * Every building with its floors and their seats, inactive ones too, each with
 * `is_active` and `active_ticket_count`.
 * @param {object} [_params] unused; lets useApiData call it like the other loaders
 * @param {{signal?: AbortSignal}} [options]
 */
export function getFacilities(_params = {}, { signal } = {}) {
  return api.get('/admin/facilities', { signal })
}

/**
 * Add a building, a floor to a building, or a seat to a floor. Resolves with the new
 * item; rejects with 409 for a name or number already used there, or 404 for a missing parent.
 * @param {'building'|'floor'|'seat'} kind
 * @param {number|null} parentId the building (for a floor) or floor (for a seat)
 * @param {string|number} value its name or number
 */
export function addFacility(kind, parentId, value) {
  return api.post(ADD_PATH[kind](parentId), { [FACILITY_KINDS[kind].field]: value })
}

/**
 * Rename and/or (de)activate an item. Resolves with it updated; rejects with 409 for a
 * name or number already used there.
 * @param {'building'|'floor'|'seat'} kind
 * @param {number} id
 * @param {object} changes e.g. {building_name: 'HQ'} or {is_active: false}
 */
export function updateFacility(kind, id, changes) {
  return api.patch(`/admin/${COLLECTION[kind]}/${Number(id)}`, changes)
}

/**
 * Delete an item nothing has used. Resolves with null; rejects with 409 when tickets use
 * it or it still has floors or seats under it.
 * @param {'building'|'floor'|'seat'} kind
 * @param {number} id
 */
export function deleteFacility(kind, id) {
  return api.delete(`/admin/${COLLECTION[kind]}/${Number(id)}`)
}
