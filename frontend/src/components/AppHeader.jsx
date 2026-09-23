import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import ApartmentIcon from '@mui/icons-material/Apartment'
import { Link as RouterLink } from 'react-router'

import useIsMobile from '../hooks/useIsMobile'

/**
 * Shared top bar. The user menu and logout arrive with sign-in (F3).
 */
function AppHeader() {
  const isMobile = useIsMobile()

  return (
    <AppBar position="sticky" color="primary">
      <Toolbar>
        <ApartmentIcon aria-hidden="true" sx={{ mr: 1.5 }} />
        <Typography
          variant="h6"
          component={RouterLink}
          to="/"
          sx={{ color: 'inherit', textDecoration: 'none' }}
        >
          {isMobile ? 'Helpdesk' : 'Facilities Helpdesk'}
        </Typography>
      </Toolbar>
    </AppBar>
  )
}

export default AppHeader
