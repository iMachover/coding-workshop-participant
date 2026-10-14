/**
 * Minimal fetch wrapper for the Project Tracker API.
 *
 * - Prefixes every path with the `api` service route (/api/api) so the same
 *   code works through the local proxy and through CloudFront.
 * - Attaches the JWT from storage as a Bearer token.
 * - Normalises errors into ApiError using the backend envelope
 *   { success: false, error: { code, message, fields } }.
 * - Notifies a listener on 401 so the app can log the user out.
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
export const API_BASE = `${API_URL.replace(/\/$/, '')}/api/api`;

const TOKEN_KEY = 'projectTracker.token';

let onUnauthorized = null;

/** Error raised for any non-2xx response or network failure. */
export class ApiError extends Error {
  /**
   * @param {number} status HTTP status (0 for network errors)
   * @param {string} code Machine-readable error code from the API
   * @param {string} message Human-readable message
   * @param {Object<string, string>} [fields] Field-level validation messages
   */
  constructor(status, code, message, fields) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields || {};
  }
}

/** @returns {string|null} the stored JWT, if any */
export function getToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** @param {string|null} token JWT to persist, or null to clear it */
export function setToken(token) {
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Storage can be unavailable (private mode); the session then lives in memory only.
  }
}

/**
 * Register a callback invoked when the API rejects the current token.
 * @param {(() => void)|null} handler
 */
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

/**
 * Perform an API request.
 * @param {string} path Path relative to the API base, e.g. "/auth/login"
 * @param {{ method?: string, body?: unknown, auth?: boolean }} [options]
 * @returns {Promise<any>} parsed JSON body (or null for 204)
 * @throws {ApiError}
 */
export async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const token = auth ? getToken() : null;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection and try again.');
  }

  const payload = response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    const error = payload?.error || {};
    if (response.status === 401 && auth && onUnauthorized) {
      onUnauthorized();
    }
    throw new ApiError(
      response.status,
      error.code || 'HTTP_ERROR',
      error.message || `Request failed with status ${response.status}`,
      error.fields,
    );
  }
  return payload;
}
