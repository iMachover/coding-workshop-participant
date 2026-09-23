import Container from '@mui/material/Container'
import { Outlet } from 'react-router'

import AppHeader from './AppHeader'

/**
 * Page frame: shared header above the current route's page.
 */
function AppLayout() {
  return (
    <>
      <AppHeader />
      <Container component="main" maxWidth="lg" sx={{ py: { xs: 2, sm: 4 } }}>
        <Outlet />
      </Container>
    </>
  )
}

export default AppLayout
