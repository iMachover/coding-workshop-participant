import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import { Outlet, useLocation } from 'react-router'

import AppHeader from './AppHeader'

// Pages that use the whole screen: on large screens they fill the window below the
// header and scroll inside their own panels instead of scrolling the page.
const FULL_SCREEN_PATHS = ['/dashboard', '/engineer', '/admin', '/admin/people', '/admin/facilities']

/**
 * Whether a route gets the full-screen frame: the dashboards, people, facilities and an admin's
 * ticket details. A trailing slash is ignored.
 * @param {string} pathname
 * @returns {boolean}
 */
function isFullScreen(pathname) {
  const path = pathname.replace(/\/$/, '')
  return FULL_SCREEN_PATHS.includes(path) || path.startsWith('/admin/tickets/')
}

/**
 * Page frame: shared header above the current route's page. Most pages sit in a 1200px
 * column; the full-screen ones (see isFullScreen) get the full width and height.
 */
function AppLayout() {
  const { pathname } = useLocation()

  if (!isFullScreen(pathname)) {
    return (
      <>
        <AppHeader />
        <Container component="main" maxWidth="lg" sx={{ py: 2 }}>
          <Outlet />
        </Container>
      </>
    )
  }

  return (
    <Box sx={{ display: { lg: 'flex' }, flexDirection: 'column', height: { lg: '100dvh' }, minHeight: { lg: 640 } }}>
      <AppHeader />
      <Container
        component="main"
        maxWidth={false}
        sx={{ py: 2, px: { xs: 2, sm: 3 }, flex: { lg: 1 }, minHeight: { lg: 0 } }}
      >
        <Outlet />
      </Container>
    </Box>
  )
}

export default AppLayout
