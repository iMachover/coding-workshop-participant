import { getSession } from './session'

// Relative by default: CloudFront (AWS) and the Vite proxy (local) both serve the API
// on the same origin as the app. VITE_API_URL can point somewhere else if needed.
const API_BASE = `${import.meta.env.VITE_API_URL ?? ''}/api/core`

const FALLBACK_MESSAGES = {
  0: "Can't reach the server. Check your connection and try again.",
  401: 'Please sign in to continue.',
  404: "We couldn't find what you were looking for.",
  422: 'Please fix the highlighted fields.',
  500: 'Something went wrong on our side. Please try again.',
}

/** An API failure with a message that is safe to show, plus per-field messages for forms. */
export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {{status: number, fieldErrors?: Record<string, string>}} details
   */
  constructor(message, { status, fieldErrors = {} }) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

/** Pydantic prefixes custom validator messages with "Value error, ". */
function cleanMessage(msg) {
  return String(msg).replace(/^Value error, /, '')
}

/**
 * Turn a FastAPI error body into an ApiError.
 * - {"detail": "text"} from our services (400/401/404/409)
 * - {"detail": [{loc: ["body", "email"], msg}]} from request validation (422)
 */
export function toApiError(status, body) {
  const detail = body?.detail
  const fallback = FALLBACK_MESSAGES[status >= 500 ? 500 : status] ?? 'Request failed.'

  if (status >= 500) return new ApiError(FALLBACK_MESSAGES[500], { status })
  if (typeof detail === 'string') return new ApiError(detail, { status })
  if (Array.isArray(detail)) {
    const fieldErrors = {}
    const general = []
    for (const issue of detail) {
      const field = issue.loc?.length > 1 ? issue.loc[issue.loc.length - 1] : null
      if (field && typeof field === 'string') {
        fieldErrors[field] ??= cleanMessage(issue.msg)
      } else {
        general.push(cleanMessage(issue.msg))
      }
    }
    return new ApiError(general[0] ?? fallback, { status, fieldErrors })
  }
  return new ApiError(fallback, { status })
}

function buildUrl(path, params) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== '') query.append(key, value)
  }
  const qs = query.toString()
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`
}

let unauthorizedHandler = null

/**
 * Register what to do when the API rejects the current session (401 on a request
 * that sent a token): it expired, it was tampered with, the user no longer exists,
 * or their role changed.
 * @param {() => void} handler
 * @returns {() => void} call to unregister
 */
export function onUnauthorized(handler) {
  unauthorizedHandler = handler
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null
  }
}

/**
 * Call the core API. Resolves with the parsed JSON body; rejects with ApiError.
 * @param {string} path e.g. "/tickets"
 * @param {{method?: string, body?: object, params?: object, signal?: AbortSignal}} [options]
 */
export async function apiRequest(path, { method = 'GET', body, params, signal } = {}) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const session = getSession()
  if (session) headers.Authorization = `Bearer ${session.token}`

  let response
  try {
    response = await fetch(buildUrl(path, params), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new ApiError(FALLBACK_MESSAGES[0], { status: 0 })
  }

  if (response.status === 204) return null
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    // A 401 without a token (e.g. a wrong password at login) is not a session problem.
    if (response.status === 401 && session) unauthorizedHandler?.()
    throw toApiError(response.status, data)
  }
  return data
}

export const api = {
  get: (path, options) => apiRequest(path, { ...options, method: 'GET' }),
  post: (path, body, options) => apiRequest(path, { ...options, method: 'POST', body }),
}
