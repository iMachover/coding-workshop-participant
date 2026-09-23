import { api } from './apiClient'

/**
 * Facility Admin people routes: engineers and their workload, everyone's roles.
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

/**
 * Everyone, by name, with their role and active-ticket count. Empty values are ignored.
 * @param {{role?: 'employee'|'engineer'|'admin', q?: string}} [filters] q matches name or email
 * @param {{signal?: AbortSignal}} [options]
 */
export function listUsers(filters = {}, { signal } = {}) {
  return api.get('/admin/users', { params: filters, signal })
}

/**
 * Move someone between employee and engineer. Resolves with the updated user; they're
 * signed out until they sign in again. Rejects with 409 (same role, or an engineer who
 * still has active tickets), 403 (an admin account) or 404.
 * @param {number|string} userId
 * @param {'employee'|'engineer'} role
 */
export function changeRole(userId, role) {
  return api.put(`/admin/users/${Number(userId)}/role`, { role })
}
