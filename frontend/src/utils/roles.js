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

/**
 * Header navigation per role. `section` is the path prefix that marks a link current, so
 * a ticket's details (/admin/tickets/5) still highlights Dashboard. Roles with a single
 * page get no links.
 */
export const NAV_LINKS = {
  admin: [
    { to: '/admin', label: 'Dashboard', section: '/admin' },
    { to: '/admin/people', label: 'People', section: '/admin/people' },
  ],
}

/**
 * The role's header links, each marked `current` for the given path. The longest
 * matching section wins, so /admin/people is People, not Dashboard.
 * @param {string} role
 * @param {string} pathname
 * @returns {{to: string, label: string, current: boolean}[]}
 */
export function navLinksFor(role, pathname) {
  const links = NAV_LINKS[role] ?? []
  const inSection = (section) => pathname === section || pathname.startsWith(`${section}/`)
  const current = links
    .filter((link) => inSection(link.section))
    .sort((a, b) => b.section.length - a.section.length)[0]
  return links.map(({ to, label }) => ({ to, label, current: current?.to === to }))
}
