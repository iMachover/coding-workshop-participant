import { describe, expect, it, vi } from 'vitest'

import { api, ApiError, toApiError } from './apiClient'
import { storeUser } from './session'

function mockFetch(status, body) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => (body === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(body)),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('requests', () => {
  it('calls the relative /api/core URL and returns parsed JSON', async () => {
    const fetchMock = mockFetch(200, [{ building_id: 1 }])

    await expect(api.get('/buildings')).resolves.toEqual([{ building_id: 1 }])

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/core/buildings')
    expect(init.method).toBe('GET')
    expect(init.body).toBeUndefined()
    expect(init.headers['Content-Type']).toBeUndefined()
  })

  it('sends JSON bodies with a Content-Type', async () => {
    const fetchMock = mockFetch(201, { user_id: 1 })

    await api.post('/auth/register', { email: 'jane@acme.inc' })

    const [, init] = fetchMock.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({ email: 'jane@acme.inc' })
  })

  it('adds query params, skipping empty values', async () => {
    const fetchMock = mockFetch(200, [])

    await api.get('/tickets', { params: { view: 'active', q: 'wi fi', status: '', urgency: null } })

    expect(fetchMock.mock.calls[0][0]).toBe('/api/core/tickets?view=active&q=wi+fi')
  })

  it('sends X-User-Id only when a dev session exists', async () => {
    const fetchMock = mockFetch(200, {})

    await api.get('/auth/me')
    expect(fetchMock.mock.calls[0][1].headers['X-User-Id']).toBeUndefined()

    storeUser({ user_id: 7, full_name: 'Jane' })
    await api.get('/auth/me')
    expect(fetchMock.mock.calls[1][1].headers['X-User-Id']).toBe('7')
  })

  it('returns null for 204 No Content', async () => {
    mockFetch(204)
    await expect(api.get('/anything')).resolves.toBeNull()
  })
})

describe('errors', () => {
  it('uses the service message from {"detail": "..."}', async () => {
    mockFetch(409, { detail: 'An account with this email already exists' })

    const error = await api.post('/auth/register', {}).catch((e) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(409)
    expect(error.message).toBe('An account with this email already exists')
  })

  it('maps 422 validation issues to fields, without the "Value error, " prefix', () => {
    const error = toApiError(422, {
      detail: [
        { loc: ['body', 'email'], msg: 'Value error, Email must be an @acme.inc address' },
        { loc: ['body', 'password'], msg: 'String should have at least 8 characters' },
        { loc: ['body', 'password'], msg: 'a second password issue is ignored' },
      ],
    })

    expect(error.fieldErrors).toEqual({
      email: 'Email must be an @acme.inc address',
      password: 'String should have at least 8 characters',
    })
    expect(error.message).toBe('Please fix the highlighted fields.')
  })

  it('uses whole-body 422 issues as the main message', () => {
    const error = toApiError(422, {
      detail: [{ loc: ['body'], msg: 'Value error, Floor-wide issues need a floor_id' }],
    })

    expect(error.message).toBe('Floor-wide issues need a floor_id')
    expect(error.fieldErrors).toEqual({})
  })

  it('hides server error details behind a friendly message', () => {
    const error = toApiError(500, { detail: 'Internal server error' })
    expect(error.message).toBe('Something went wrong on our side. Please try again.')
  })

  it('falls back to a status message when the body is not JSON', async () => {
    mockFetch(404)
    const error = await api.get('/missing').catch((e) => e)
    expect(error.message).toBe("We couldn't find what you were looking for.")
  })

  it('uses a generic message for unexpected statuses', () => {
    expect(toApiError(418, null).message).toBe('Request failed.')
  })

  it('reports network failures as status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const error = await api.get('/health').catch((e) => e)

    expect(error.status).toBe(0)
    expect(error.message).toBe("Can't reach the server. Check your connection and try again.")
  })

  it('lets cancelled requests reject as AbortError', async () => {
    const abort = new DOMException('Aborted', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort))

    await expect(api.get('/tickets')).rejects.toBe(abort)
  })
})
