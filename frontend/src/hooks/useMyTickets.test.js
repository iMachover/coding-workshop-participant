import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../services/apiClient'
import { listMyTickets } from '../services/ticketService'
import { TICKETS } from '../test/fixtures'
import useMyTickets from './useMyTickets'

vi.mock('../services/ticketService', () => ({ listMyTickets: vi.fn() }))

beforeEach(() => {
  vi.mocked(listMyTickets).mockReset()
})

describe('useMyTickets', () => {
  it('loads tickets for the filters', async () => {
    vi.mocked(listMyTickets).mockResolvedValue(TICKETS)

    const { result } = renderHook(() => useMyTickets({ view: 'active' }))

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.tickets).toEqual(TICKETS)
    expect(result.current.error).toBeNull()
    expect(listMyTickets).toHaveBeenCalledWith({ view: 'active' }, { signal: expect.any(AbortSignal) })
  })

  it('does not refetch for new-but-equal filter objects', async () => {
    vi.mocked(listMyTickets).mockResolvedValue([])
    const { result, rerender } = renderHook(({ filters }) => useMyTickets(filters), {
      initialProps: { filters: { view: 'active' } },
    })
    await waitFor(() => expect(result.current.loading).toBe(false))

    rerender({ filters: { view: 'active' } })

    expect(listMyTickets).toHaveBeenCalledTimes(1)
  })

  it('cancels the older request when the filters change, keeping old rows meanwhile', async () => {
    let resolveSecond
    vi.mocked(listMyTickets)
      .mockResolvedValueOnce(TICKETS)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve }))
    const { result, rerender } = renderHook(({ filters }) => useMyTickets(filters), {
      initialProps: { filters: { q: '' } },
    })
    await waitFor(() => expect(result.current.loading).toBe(false))

    rerender({ filters: { q: 'printer' } })

    expect(result.current.loading).toBe(true)
    expect(result.current.tickets).toEqual(TICKETS)
    const firstSignal = vi.mocked(listMyTickets).mock.calls[0][1].signal
    expect(firstSignal.aborted).toBe(true)

    await act(async () => resolveSecond([TICKETS[0]]))
    expect(result.current.tickets).toEqual([TICKETS[0]])
    expect(result.current.loading).toBe(false)
  })

  it('reports an error and can retry', async () => {
    const failure = new ApiError("Can't reach the server.", { status: 0 })
    vi.mocked(listMyTickets).mockRejectedValueOnce(failure).mockResolvedValueOnce(TICKETS)

    const { result } = renderHook(() => useMyTickets())
    await waitFor(() => expect(result.current.error).toBe(failure))
    expect(result.current.tickets).toEqual([])

    act(() => result.current.reload())
    expect(result.current.error).toBeNull()
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.tickets).toEqual(TICKETS))
  })

  it('ignores a request cancelled by unmounting', async () => {
    vi.mocked(listMyTickets).mockImplementation((_filters, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      }),
    )
    const { result, unmount } = renderHook(() => useMyTickets())

    unmount()

    await Promise.resolve()
    expect(result.current.error).toBeNull()
  })
})
