/**
 * Authentication endpoints.
 */

import { request } from './apiClient';

/**
 * Exchange credentials for a token.
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{ token: string, token_type: string, expires_in: number, user: object }>}
 */
export function login(username, password) {
  return request('/auth/login', { method: 'POST', body: { username, password }, auth: false });
}

/**
 * Fetch the profile of the currently authenticated user.
 * @returns {Promise<object>}
 */
export function fetchMe() {
  return request('/me');
}
