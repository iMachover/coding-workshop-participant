/**
 * Roles and where each one starts. Codes match the API (schemas.py Role).
 * The API enforces access (403); these only decide what the UI shows.
 */

export const ROLES = {
  employee: { label: 'Employee', home: '/dashboard' },
  engineer: { label: 'Engineer', home: '/engineer' },
  admin: { label: 'Facility Admin', home: '/admin' },
}

/**
 * The start page for a role. Unknown roles fall back to the employee dashboard,
 * where the API decides what they may see.
 * @param {string} role
 * @returns {string}
 */
export function homePathFor(role) {
  return ROLES[role]?.home ?? ROLES.employee.home
}

/**
 * A role's display name, e.g. "Facility Admin".
 * @param {string} role
 * @returns {string}
 */
export function roleLabel(role) {
  return ROLES[role]?.label ?? role
}
