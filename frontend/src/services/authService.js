import { api } from './apiClient'

/**
 * Check credentials. Resolves with the user (including user_id); rejects with
 * ApiError 401 "Invalid email or password" on a wrong email or password.
 * @param {{email: string, password: string}} credentials
 */
export function login({ email, password }) {
  return api.post('/auth/login', { email: email.trim(), password })
}

/**
 * Create an employee account. Resolves with the new user; rejects with ApiError
 * (409 if the email is taken, 422 with fieldErrors for invalid input).
 * @param {{email: string, full_name: string, phone_number?: string, password: string}} details
 */
export function register({ email, full_name, phone_number, password }) {
  return api.post('/auth/register', {
    email: email.trim(),
    full_name: full_name.trim(),
    // The API rejects an empty string, so a blank optional phone is left out.
    ...(phone_number?.trim() ? { phone_number: phone_number.trim() } : {}),
    password,
  })
}
