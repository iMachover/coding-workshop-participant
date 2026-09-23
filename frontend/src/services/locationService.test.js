import { describe, expect, it, vi } from 'vitest'

import { api } from './apiClient'
import { listBuildings, listFloors, listSeats } from './locationService'

describe('locationService', () => {
  it('lists buildings, floors of a building and seats of a floor', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue([])
    const { signal } = new AbortController()

    await listBuildings({}, { signal })
    await listFloors({ buildingId: '2' }, { signal })
    await listSeats({ floorId: 3 })
    await listBuildings()

    expect(get.mock.calls).toEqual([
      ['/buildings', { signal }],
      ['/buildings/2/floors', { signal }],
      ['/floors/3/seats', { signal: undefined }],
      ['/buildings', { signal: undefined }],
    ])
  })
})
