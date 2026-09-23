/**
 * Client-side checks for the register form. They mirror the API's rules (schemas.py)
 * so users get instant feedback; the API still validates everything itself.
 */

const ACME_EMAIL = /^[^@\s]+@acme\.inc$/i

export const REGISTER_FIELDS = ['full_name', 'email', 'phone_number', 'password', 'confirm_password']

const rules = {
  full_name: ({ full_name }) => {
    if (!full_name.trim()) return 'Enter your full name.'
    if (full_name.trim().length > 100) return 'Use 100 characters or fewer.'
    return ''
  },
  email: ({ email }) => {
    if (!email.trim()) return 'Enter your work email.'
    if (email.trim().length > 254 || !ACME_EMAIL.test(email.trim())) {
      return 'Use your @acme.inc email address.'
    }
    return ''
  },
  phone_number: ({ phone_number }) =>
    phone_number.trim().length > 30 ? 'Use 30 characters or fewer.' : '',
  password: ({ password }) => {
    if (!password) return 'Enter a password.'
    if (password.length < 8) return 'Use at least 8 characters.'
    if (password.length > 128) return 'Use 128 characters or fewer.'
    return ''
  },
  confirm_password: ({ password, confirm_password }) => {
    if (!confirm_password) return 'Re-enter your password.'
    if (confirm_password !== password) return "Passwords don't match."
    return ''
  },
}

/**
 * Error message for one field, or '' if it's valid.
 * @param {string} field one of REGISTER_FIELDS
 * @param {Record<string, string>} values all form values (confirm_password needs password)
 */
export function validateRegisterField(field, values) {
  return rules[field](values)
}

/**
 * All current errors, keyed by field. Empty object means the form can be submitted.
 * @param {Record<string, string>} values
 * @returns {Record<string, string>}
 */
export function validateRegisterForm(values) {
  const errors = {}
  for (const field of REGISTER_FIELDS) {
    const message = validateRegisterField(field, values)
    if (message) errors[field] = message
  }
  return errors
}
