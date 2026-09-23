import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import ApartmentIcon from '@mui/icons-material/Apartment'
import LogoutIcon from '@mui/icons-material/Logout'
import PropTypes from 'prop-types'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router'

import useAuth from '../auth/useAuth'
import useIsMobile from '../hooks/useIsMobile'
import { navLinksFor, roleLabel } from '../utils/roles'

/** The role's page links. The current one is marked for screen readers and underlined. */
function MainNav({ links }) {
  return (
    <Box component="nav" aria-label="Main" sx={{ display: 'flex', gap: 1 }}>
      {links.map((link) => (
        <Button
          key={link.to}
          component={RouterLink}
          to={link.to}
          color="inherit"
          aria-current={link.current ? 'page' : undefined}
          sx={{
            fontWeight: link.current ? 700 : 400,
            borderBottom: 2,
            borderRadius: 0,
            borderColor: link.current ? 'currentColor' : 'transparent',
          }}
        >
          {link.label}
        </Button>
      ))}
    </Box>
  )
}

MainNav.propTypes = {
  links: PropTypes.arrayOf(
    PropTypes.shape({
      to: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      current: PropTypes.bool.isRequired,
    }),
  ).isRequired,
}

/**
 * Shared top bar: app name, the role's page links, and the signed-in user's name with a
 * sign-out action. Engineers and admins also get a role chip. On phones the name is
 * hidden, sign-out becomes an icon button and the page links move to a second row.
 */
function AppHeader() {
  const isMobile = useIsMobile()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const links = user ? navLinksFor(user.role, pathname) : []

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
        {!isMobile && links.length > 0 && (
          <Box sx={{ ml: 4 }}>
            <MainNav links={links} />
          </Box>
        )}

        {user && (
          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
            {!isMobile && <Typography component="span">{user.full_name}</Typography>}
            {user.role !== 'employee' && (
              <Chip
                label={roleLabel(user.role)}
                size="small"
                variant="outlined"
                sx={{ color: 'inherit', borderColor: 'currentColor' }}
              />
            )}
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
      {isMobile && links.length > 0 && (
        <Toolbar variant="dense" sx={{ minHeight: 40 }}>
          <MainNav links={links} />
        </Toolbar>
      )}
    </AppBar>
  )
}

export default AppHeader
