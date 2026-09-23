import { render } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import { Context as ResponsiveContext } from 'react-responsive'
import { MemoryRouter } from 'react-router'

import AuthProvider from '../auth/AuthProvider'
import { storeSession } from '../services/session'
import theme from '../theme'

export const JANE = {
  user_id: 1,
  email: 'jane@acme.inc',
  full_name: 'Jane Doe',
  phone_number: null,
  role: 'employee',
  created_at: '2026-09-22T20:21:06-04:00',
}

/** A token-shaped placeholder; unit tests mock the API, so it is never verified. */
export const TEST_TOKEN = 'test.header.token'

/**
 * Render with the app's theme, router and auth, at a chosen URL and screen width.
 * @param {import('react').ReactElement} ui
 * @param {{route?: string | object, width?: number, user?: object}} [options]
 *   width 375 = phone, 1280 = desktop; user = start signed in as this user
 */
export function renderWithProviders(ui, { route = '/', width = 1280, user } = {}) {
  if (user) storeSession({ token: TEST_TOKEN, user })
  return render(
    <ResponsiveContext.Provider value={{ width }}>
      <ThemeProvider theme={theme}>
        <MemoryRouter initialEntries={[route]}>
          <AuthProvider>{ui}</AuthProvider>
        </MemoryRouter>
      </ThemeProvider>
    </ResponsiveContext.Provider>,
  )
}
