import { useState } from 'react'
import AppBar from '@mui/material/AppBar'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import ApartmentIcon from '@mui/icons-material/Apartment'
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown'
import LogoutIcon from '@mui/icons-material/Logout'
import PropTypes from 'prop-types'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router'

import useAuth from '../auth/useAuth'
import useIsMobile from '../hooks/useIsMobile'
import { brand } from '../theme'
import { navLinksFor, roleLabel } from '../utils/roles'

const LINK_SHAPE = PropTypes.shape({
  to: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  current: PropTypes.bool.isRequired,
})

/**
 * Up to two initials from a full name, e.g. "Jane Doe" -> "JD".
 * @param {string} fullName
 * @returns {string}
 */
function initialsOf(fullName) {
  const words = fullName.trim().split(/\s+/).filter(Boolean)
  const picked = words.length > 1 ? [words[0], words[words.length - 1]] : words
  return picked.map((word) => word[0].toUpperCase()).join('')
}

/** The role's page links. The current one is marked for screen readers and underlined in sky blue. */
function MainNav({ links }) {
  return (
    <Box component="nav" aria-label="Main" sx={{ display: 'flex' }}>
      {links.map((link) => (
        <Button
          key={link.to}
          component={RouterLink}
          to={link.to}
          color="inherit"
          aria-current={link.current ? 'page' : undefined}
          sx={{
            height: 48,
            px: 1.75,
            borderRadius: 0,
            borderBottom: 3,
            borderColor: link.current ? brand.sky : 'transparent',
            fontWeight: link.current ? 700 : 400,
            opacity: link.current ? 1 : 0.82,
            '&:hover': { bgcolor: 'rgba(255,255,255,.08)' },
          }}
        >
          {link.label}
        </Button>
      ))}
    </Box>
  )
}

MainNav.propTypes = {
  links: PropTypes.arrayOf(LINK_SHAPE).isRequired,
}

/** Phones: the role's page links as a scrollable tab row under the header. */
function MobileNav({ links }) {
  const currentIndex = links.findIndex((link) => link.current)

  return (
    <Box component="nav" aria-label="Main" sx={{ borderTop: '1px solid rgba(255,255,255,.12)' }}>
      <Tabs
        aria-label="Main"
        value={currentIndex === -1 ? false : currentIndex}
        variant="scrollable"
        scrollButtons={false}
        slotProps={{ indicator: { sx: { bgcolor: brand.sky, height: 3 } } }}
        sx={{ minHeight: 44 }}
      >
        {links.map((link) => (
          <Tab
            key={link.to}
            component={RouterLink}
            to={link.to}
            label={link.label}
            aria-current={link.current ? 'page' : undefined}
            sx={{
              minHeight: 44,
              color: 'inherit',
              textTransform: 'none',
              '&.Mui-selected': { color: 'inherit', fontWeight: 700 },
            }}
          />
        ))}
      </Tabs>
    </Box>
  )
}

MobileNav.propTypes = {
  links: PropTypes.arrayOf(LINK_SHAPE).isRequired,
}

/**
 * Shared navy top bar: app name, the role's page links, and an Account menu with the
 * signed-in user's details and sign-out. Engineers and admins also get a role chip. On
 * phones the account button shrinks to an avatar and the page links move to a tab row.
 */
function AppHeader() {
  const isMobile = useIsMobile()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [menuAnchor, setMenuAnchor] = useState(null)
  const links = user ? navLinksFor(user.role, pathname) : []
  const menuOpen = Boolean(menuAnchor)
  const initials = user ? initialsOf(user.full_name) : ''

  const handleSignOut = () => {
    setMenuAnchor(null)
    signOut("You've signed out.")
    navigate('/login', { replace: true })
  }

  const accountButtonProps = {
    'aria-label': 'Account',
    'aria-haspopup': 'menu',
    'aria-expanded': menuOpen,
    'aria-controls': menuOpen ? 'account-menu' : undefined,
    onClick: (event) => setMenuAnchor(event.currentTarget),
  }

  return (
    <AppBar position="sticky" sx={{ bgcolor: brand.navy }}>
      <Toolbar variant="dense" sx={{ minHeight: 48, px: { xs: 2, sm: 2.5 } }}>
        <ApartmentIcon aria-hidden="true" sx={{ mr: 1.5 }} />
        <Box
          component={RouterLink}
          to="/"
          sx={{ color: 'inherit', textDecoration: 'none', display: 'flex', flexDirection: 'column' }}
        >
          <Typography component="span" sx={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2 }}>
            ACME Facilities
          </Typography>
          <Typography component="span" sx={{ fontSize: 11, lineHeight: 1.2, opacity: 0.75 }}>
            Incident Desk
          </Typography>
        </Box>
        {!isMobile && links.length > 0 && (
          <Box sx={{ ml: 4 }}>
            <MainNav links={links} />
          </Box>
        )}

        {user && (
          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {user.role !== 'employee' && (
              <Chip
                label={roleLabel(user.role)}
                size="small"
                variant="outlined"
                sx={{ color: 'inherit', borderColor: brand.white }}
              />
            )}
            {isMobile ? (
              <IconButton color="inherit" sx={{ p: 0.5 }} {...accountButtonProps}>
                <Avatar sx={{ width: 32, height: 32, fontSize: 14, bgcolor: brand.blue }}>{initials}</Avatar>
              </IconButton>
            ) : (
              <Button
                color="inherit"
                endIcon={<ArrowDropDownIcon />}
                sx={{ textTransform: 'none', fontWeight: 400, '&:hover': { bgcolor: 'rgba(255,255,255,.08)' } }}
                {...accountButtonProps}
              >
                <Avatar sx={{ width: 28, height: 28, fontSize: 13, bgcolor: brand.blue, mr: 1 }}>{initials}</Avatar>
                {user.full_name}
              </Button>
            )}
            <Menu
              id="account-menu"
              anchorEl={menuAnchor}
              open={menuOpen}
              onClose={() => setMenuAnchor(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              slotProps={{ paper: { sx: { width: 260 } } }}
            >
              <Box component="li" role="none" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1 }}>
                <Avatar sx={{ width: 40, height: 40, bgcolor: brand.blue }}>{initials}</Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 600 }} noWrap>
                    {user.full_name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" component="p" noWrap>
                    {user.email}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" component="p">
                    {roleLabel(user.role)}
                  </Typography>
                </Box>
              </Box>
              <Divider />
              <MenuItem onClick={handleSignOut}>
                <ListItemIcon>
                  <LogoutIcon fontSize="small" />
                </ListItemIcon>
                Sign out
              </MenuItem>
            </Menu>
          </Box>
        )}
      </Toolbar>
      {isMobile && links.length > 0 && <MobileNav links={links} />}
    </AppBar>
  )
}

export default AppHeader
