import { describe, expect, it } from 'vitest'

import { clearStoredUser, getStoredUser, storeUser } from './session'

describe('dev-only session', () => {
  it('stores, reads and clears the user', () => {
    expect(getStoredUser()).toBeNull()

    storeUser({ user_id: 3, full_name: 'Eve' })
    expect(getStoredUser()).toEqual({ user_id: 3, full_name: 'Eve' })

    clearStoredUser()
    expect(getStoredUser()).toBeNull()
  })

  it.each([
    ['not json', '{oops'],
    ['missing user_id', '{"full_name":"Eve"}'],
    ['non-integer user_id', '{"user_id":"3"}'],
  ])('ignores a corrupted value (%s)', (_label, raw) => {
    localStorage.setItem('helpdesk.devSession', raw)
    expect(getStoredUser()).toBeNull()
  })
})
