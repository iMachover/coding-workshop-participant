import { describe, expect, it } from 'vitest'

import { validateRegisterField, validateRegisterForm } from './registerValidation'

const VALID = {
  full_name: 'Jane Doe',
  email: 'jane@acme.inc',
  phone_number: '',
  password: 'password123',
  confirm_password: 'password123',
}

describe('register validation', () => {
  it('accepts a valid form, with or without a phone', () => {
    expect(validateRegisterForm(VALID)).toEqual({})
    expect(validateRegisterForm({ ...VALID, phone_number: '555-0101' })).toEqual({})
  })

  it('reports every missing required field', () => {
    expect(validateRegisterForm({ ...VALID, full_name: ' ', email: '', password: '', confirm_password: '' }))
      .toEqual({
        full_name: 'Enter your full name.',
        email: 'Enter your work email.',
        password: 'Enter a password.',
        confirm_password: 'Re-enter your password.',
      })
  })

  it.each(['jane@gmail.com', 'jane@acme.inc.evil.com', 'jane@notacme.inc', 'jane acme.inc', 'a b@acme.inc'])(
    'rejects %s',
    (email) => {
      expect(validateRegisterField('email', { ...VALID, email })).toBe('Use your @acme.inc email address.')
    },
  )

  it('accepts acme emails with spaces around them or capitals', () => {
    expect(validateRegisterField('email', { ...VALID, email: '  Jane.Doe@ACME.inc ' })).toBe('')
  })

  it.each([
    ['full_name', 'x'.repeat(101), 'Use 100 characters or fewer.'],
    ['phone_number', '1'.repeat(31), 'Use 30 characters or fewer.'],
    ['email', `${'x'.repeat(250)}@acme.inc`, 'Use your @acme.inc email address.'],
  ])('limits the length of %s', (field, value, message) => {
    expect(validateRegisterField(field, { ...VALID, [field]: value })).toBe(message)
  })

  it('checks password length both ways', () => {
    expect(validateRegisterField('password', { ...VALID, password: 'short' })).toBe('Use at least 8 characters.')
    expect(validateRegisterField('password', { ...VALID, password: 'x'.repeat(129) })).toBe(
      'Use 128 characters or fewer.',
    )
  })

  it('requires the confirmation to match', () => {
    expect(validateRegisterField('confirm_password', { ...VALID, confirm_password: 'password124' })).toBe(
      "Passwords don't match.",
    )
  })
})
