import { render } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import { Context as ResponsiveContext } from 'react-responsive'
import { MemoryRouter } from 'react-router'

import theme from '../theme'

/**
 * Render with the app's theme and router, at a chosen URL and screen width.
 * @param {import('react').ReactElement} ui
 * @param {{route?: string, width?: number}} [options] width 375 = phone, 1280 = desktop
 */
export function renderWithProviders(ui, { route = '/', width = 1280 } = {}) {
  return render(
    <ResponsiveContext.Provider value={{ width }}>
      <ThemeProvider theme={theme}>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </ThemeProvider>
    </ResponsiveContext.Provider>,
  )
}
