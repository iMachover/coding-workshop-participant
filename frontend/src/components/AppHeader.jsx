import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import ApartmentIcon from '@mui/icons-material/Apartment'
import LogoutIcon from '@mui/icons-material/Logout'
import { Link as RouterLink, useNavigate } from 'react-router'

import useAuth from '../auth/useAuth'
import useIsMobile from '../hooks/useIsMobile'

/**
 * Shared top bar: app name, and the signed-in user's name with a sign-out action.
 * On phones the name is hidden and sign-out becomes an icon button.
 */
function AppHeader() {
  const isMobile = useIsMobile()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = () => {
    signOut("You've signed out.")
    navigate('/login', { replace: true })
  }

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

        {user && (
          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
            {!isMobile && <Typography component="span">{user.full_name}</Typography>}
            {isMobile ? (
              <IconButton color="inherit" aria-label="Sign out" onClick={handleSignOut}>
                <LogoutIcon />
              </IconButton>
            ) : (
              <Button color="inherit" variant="outlined" startIcon={<LogoutIcon />} onClick={handleSignOut}>
                Sign out
              </Button>
            )}
          </Box>
        )}
      </Toolbar>
    </AppBar>
  )
}

export default AppHeader
