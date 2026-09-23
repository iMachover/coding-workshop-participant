/**
 * The signed-in session: the access token from POST /auth/login, plus the user it
 * belongs to (for showing their name without an extra request).
 *
 * Kept in localStorage so it survives reloads and new tabs. The token is a signed JWT
 * that expires after an hour; the API checks it on every request, so a copied or
 * edited value can't grant anything the server hasn't signed. apiClient sends it as
 * `Authorization: Bearer <token>`.
 */

const STORAGE_KEY = 'helpdesk.session'

/** Three base64url parts separated by dots. Only a shape check; the API verifies it. */
const JWT_SHAPE = /^[\w-]+\.[\w-]+\.[\w-]+$/

/**
 * The stored session, or null if there is none or it can't be read.
 * @returns {{token: string, user: {user_id: number}} | null}
 */
export function getSession() {
  try {
    const session = JSON.parse(localStorage.getItem(STORAGE_KEY))
    const valid = JWT_SHAPE.test(session?.token) && Number.isInteger(session?.user?.user_id)
    return valid ? session : null
  } catch {
    return null
  }
}

/**
 * Remember the signed-in session.
 * @param {{token: string, user: object}} session
 */
export function storeSession(session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

/** Forget the session (sign out). */
export function clearSession() {
  localStorage.removeItem(STORAGE_KEY)
}
