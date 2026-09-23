import { api } from './apiClient'

/**
 * Facility Admin people routes: engineers and their workload (user roles come in A3).
 * Admins only; the API answers 403 for other roles.
 */

/**
 * Every engineer with their active-ticket counts (open, in progress, blocked, P1),
 * lightest load first.
 * @param {object} [_params] unused; lets useApiData call it like the other loaders
 * @param {{signal?: AbortSignal}} [options]
 */
export function listEngineers(_params = {}, { signal } = {}) {
  return api.get('/admin/engineers', { signal })
}
