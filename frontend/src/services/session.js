/**
 * DEV-ONLY SESSION: THIS IS NOT REAL AUTHENTICATION.
 *
 * The signed-in user is kept in localStorage, and apiClient sends its user_id as the
 * X-User-Id header. Anyone can edit localStorage or send any X-User-Id, so this only
 * identifies the caller during development. JWT will replace this module: store the
 * token here instead, and apiClient will send it as an Authorization header.
 */

const STORAGE_KEY = 'helpdesk.devSession'

/**
 * Return the stored user, or null if there is none or it can't be read.
 * @returns {{user_id: number} | null}
 */
export function getStoredUser() {
  try {
    const user = JSON.parse(localStorage.getItem(STORAGE_KEY))
    return Number.isInteger(user?.user_id) ? user : null
  } catch {
    return null
  }
}

/**
 * Remember the signed-in user.
 * @param {{user_id: number}} user
 */
export function storeUser(user) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
}

/** Forget the signed-in user. */
export function clearStoredUser() {
  localStorage.removeItem(STORAGE_KEY)
}
