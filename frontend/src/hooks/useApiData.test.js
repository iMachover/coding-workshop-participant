import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import useApiData from './useApiData'

// Cancellation, retry and error handling are covered through useMyTickets.test.js.
describe('useApiData', () => {
  it('waits while skipped, then loads once allowed', async () => {
    const fetcher = vi.fn().mockResolvedValue(['Floor 1'])
    const { result, rerender } = renderHook(({ id }) => useApiData(fetcher, { id }, { skip: !id }), {
      initialProps: { id: '' },
    })

    expect(result.current).toMatchObject({ data: undefined, loading: false, error: null })
    expect(fetcher).not.toHaveBeenCalled()

    rerender({ id: '1' })
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.data).toEqual(['Floor 1']))
    expect(fetcher).toHaveBeenCalledWith({ id: '1' }, { signal: expect.any(AbortSignal) })
  })

  it('defaults to no params', async () => {
    const fetcher = vi.fn().mockResolvedValue('ok')
    const { result } = renderHook(() => useApiData(fetcher))
    await waitFor(() => expect(result.current.data).toBe('ok'))
    expect(fetcher.mock.calls[0][0]).toEqual({})
  })
})
