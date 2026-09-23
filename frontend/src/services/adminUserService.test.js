import { describe, expect, it, vi } from 'vitest'

import { api } from './apiClient'
import { changeRole, listEngineers, listUsers } from './adminUserService'

describe('adminUserService', () => {
  it('lists engineers with their workload', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue([])
    const { signal } = new AbortController()

    await listEngineers({}, { signal })
    await listEngineers()

    expect(get.mock.calls).toEqual([
      ['/admin/engineers', { signal }],
      ['/admin/engineers', { signal: undefined }],
    ])
  })

  it('lists people with filters as query params', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue([])
    const { signal } = new AbortController()

    await listUsers({ role: 'engineer', q: 'sam' }, { signal })
    await listUsers()

    expect(get.mock.calls).toEqual([
      ['/admin/users', { params: { role: 'engineer', q: 'sam' }, signal }],
      ['/admin/users', { params: {}, signal: undefined }],
    ])
  })

  it('changes a role', async () => {
    const put = vi.spyOn(api, 'put').mockResolvedValue({ user_id: 3, role: 'engineer' })

    await expect(changeRole('3', 'engineer')).resolves.toEqual({ user_id: 3, role: 'engineer' })

    expect(put).toHaveBeenCalledWith('/admin/users/3/role', { role: 'engineer' })
  })
})
