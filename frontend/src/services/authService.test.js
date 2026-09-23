import { describe, expect, it, vi } from 'vitest'

import { api } from './apiClient'
import { register } from './authService'

describe('authService.register', () => {
  it('posts trimmed details and leaves out a blank phone', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ user_id: 1 })

    await register({ email: ' jane@acme.inc ', full_name: ' Jane ', phone_number: '  ', password: ' pw with spaces ' })

    expect(post).toHaveBeenCalledWith('/auth/register', {
      email: 'jane@acme.inc',
      full_name: 'Jane',
      password: ' pw with spaces ',
    })
  })

  it('includes the phone when given', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ user_id: 1 })

    await register({ email: 'j@acme.inc', full_name: 'J', phone_number: ' 555-0101 ', password: 'password123' })

    expect(post.mock.calls[0][1].phone_number).toBe('555-0101')
  })
})
