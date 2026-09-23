import { act, render, renderHook, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { api } from '../services/apiClient'
import { getSession, storeSession } from '../services/session'
import { JANE, TEST_TOKEN } from '../test/renderWithProviders'
import { SESSION_ENDED } from './AuthContext'
import AuthProvider from './AuthProvider'
import useAuth from './useAuth'

const SESSION = { token: TEST_TOKEN, user: JANE }

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>

describe('AuthProvider', () => {
  it('starts from the stored session', () => {
    storeSession(SESSION)
    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.user).toEqual(JANE)
  })

  it('signs in and out, keeping localStorage in step', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.user).toBeNull()

    act(() => result.current.signIn(SESSION))
    expect(result.current.user).toEqual(JANE)
    expect(getSession()).toEqual(SESSION)

    act(() => result.current.signOut())
    expect(result.current.user).toBeNull()
    expect(getSession()).toBeNull()
    expect(result.current.notice).toBeNull()
  })

  it('remembers why the user signed out until they sign in again', () => {
    storeSession(SESSION)
    const { result } = renderHook(() => useAuth(), { wrapper })

    act(() => result.current.signOut("You've signed out."))
    expect(result.current.notice).toBe("You've signed out.")

    act(() => result.current.signIn(SESSION))
    expect(result.current.notice).toBeNull()
  })

  it('signs out when the API rejects the session', async () => {
    storeSession(SESSION)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ detail: 'Unknown user' }),
    }))
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(() => api.get('/auth/me').catch(() => {}))

    expect(result.current.user).toBeNull()
    expect(getSession()).toBeNull()
    expect(result.current.notice).toBe(SESSION_ENDED)
  })

  it('stops listening for rejected sessions once unmounted', async () => {
    const { unmount } = render(<AuthProvider><p>app</p></AuthProvider>)
    unmount()
    storeSession(SESSION)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({}) }))

    await api.get('/auth/me').catch(() => {})

    expect(getSession()).toEqual(SESSION)
  })

  it('renders its children', () => {
    render(<AuthProvider><p>inside</p></AuthProvider>)
    expect(screen.getByText('inside')).toBeInTheDocument()
  })
})

describe('useAuth', () => {
  it('explains when used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used inside <AuthProvider>')
  })
})
