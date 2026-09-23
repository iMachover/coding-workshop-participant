import { describe, expect, it, vi } from 'vitest'

import { api } from './apiClient'
import { listEngineers } from './adminUserService'

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
})
