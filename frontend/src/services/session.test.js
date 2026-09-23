import { describe, expect, it } from 'vitest'

import { clearSession, getSession, storeSession } from './session'

const SESSION = { token: 'aaa.bbb.ccc', user: { user_id: 3, full_name: 'Eve', role: 'employee' } }

describe('session', () => {
  it('stores, reads and clears the token and user', () => {
    expect(getSession()).toBeNull()

    storeSession(SESSION)
    expect(getSession()).toEqual(SESSION)

    clearSession()
    expect(getSession()).toBeNull()
  })

  it.each([
    ['not json', '{oops'],
    ['no token', JSON.stringify({ user: { user_id: 3, role: 'employee' } })],
    ['not a JWT', JSON.stringify({ token: 'just-a-string', user: { user_id: 3, role: 'employee' } })],
    ['no user', JSON.stringify({ token: 'aaa.bbb.ccc' })],
    ['non-integer user_id', JSON.stringify({ token: 'aaa.bbb.ccc', user: { user_id: '3', role: 'employee' } })],
    ['no role', JSON.stringify({ token: 'aaa.bbb.ccc', user: { user_id: 3 } })],
  ])('ignores a corrupted value (%s)', (_label, raw) => {
    localStorage.setItem('helpdesk.session', raw)
    expect(getSession()).toBeNull()
  })

  it('ignores the old dev-only session from before tokens', () => {
    localStorage.setItem('helpdesk.devSession', JSON.stringify({ user_id: 3, full_name: 'Eve' }))
    expect(getSession()).toBeNull()
  })
})
