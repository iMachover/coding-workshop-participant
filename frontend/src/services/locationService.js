import { api } from './apiClient'

/**
 * Location lookups for the Building -> Floor -> Seat dropdowns. Each takes
 * (params, {signal}) so it can be used directly with useApiData.
 */

/** All buildings, alphabetically. */
export function listBuildings(_params = {}, { signal } = {}) {
  return api.get('/buildings', { signal })
}

/** A building's floors, lowest first. Rejects with 404 for an unknown building. */
export function listFloors({ buildingId }, { signal } = {}) {
  return api.get(`/buildings/${Number(buildingId)}/floors`, { signal })
}

/** A floor's seats. Rejects with 404 for an unknown floor. */
export function listSeats({ floorId }, { signal } = {}) {
  return api.get(`/floors/${Number(floorId)}/seats`, { signal })
}
