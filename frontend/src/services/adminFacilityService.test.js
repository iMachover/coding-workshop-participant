import { describe, expect, it, vi } from 'vitest'

import { api } from './apiClient'
import { addFacility, deleteFacility, getFacilities, updateFacility } from './adminFacilityService'

describe('adminFacilityService', () => {
  it('loads the whole tree', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue([])
    const { signal } = new AbortController()

    await getFacilities({}, { signal })
    await getFacilities()

    expect(get.mock.calls).toEqual([
      ['/admin/facilities', { signal }],
      ['/admin/facilities', { signal: undefined }],
    ])
  })

  it('adds each level under its parent, with the field the API expects', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({})

    await addFacility('building', null, 'Annex')
    await addFacility('floor', '3', -1)
    await addFacility('seat', 6, 'B-12')

    expect(post.mock.calls).toEqual([
      ['/admin/buildings', { building_name: 'Annex' }],
      ['/admin/buildings/3/floors', { floor_number: -1 }],
      ['/admin/floors/6/seats', { seat_number: 'B-12' }],
    ])
  })

  it('updates and deletes each level by id', async () => {
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({})
    const del = vi.spyOn(api, 'delete').mockResolvedValue(null)

    await updateFacility('building', 1, { building_name: 'HQ' })
    await updateFacility('floor', '2', { is_active: false })
    await updateFacility('seat', 9, { seat_number: '9A' })
    await expect(deleteFacility('seat', '9')).resolves.toBeNull()
    await deleteFacility('floor', 2)
    await deleteFacility('building', 1)

    expect(patch.mock.calls).toEqual([
      ['/admin/buildings/1', { building_name: 'HQ' }],
      ['/admin/floors/2', { is_active: false }],
      ['/admin/seats/9', { seat_number: '9A' }],
    ])
    expect(del.mock.calls).toEqual([['/admin/seats/9'], ['/admin/floors/2'], ['/admin/buildings/1']])
  })
})
