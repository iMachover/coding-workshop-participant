import PropTypes from 'prop-types';
import { NavLink } from 'react-router-dom';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import { useAuth } from '../context/useAuth';
import { NAV_BY_ROLE, ROLE_LABELS } from '../config/navigation';
import { headingFont, tokens } from '../theme';

function Logo() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1.375 }}>
      <Box
        aria-hidden="true"
        sx={{
          width: 29,
          height: 29,
          borderRadius: '7px',
          bgcolor: 'primary.main',
          color: '#ecf2df',
          display: 'grid',
          placeItems: 'center',
          fontSize: 20,
          letterSpacing: '-5px',
          pr: '5px',
        }}
      >
        ∕∕
      </Box>
      <Typography
        component="span"
        sx={{ fontFamily: headingFont, fontWeight: 800, fontSize: 21, letterSpacing: '-1px' }}
      >
        ACME
        <Typography component="span" sx={{ fontWeight: 400, fontSize: 14, letterSpacing: 0, ml: 0.5 }}>
          inc.
        </Typography>
      </Typography>
    </Box>
  );
}

function initials(user) {
  return `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase();
}

/**
 * Left navigation (prototype `RoleShell` sidebar): logo, workspace card, the signed-in
 * role's pages and the user chip with log out. Only pages the role may open are listed.
 *
 * @param {{ onNavigate?: () => void }} props Called after a link is chosen (closes the mobile drawer).
 */
export function Sidebar({ onNavigate }) {
  const { user, logout } = useAuth();
  const items = NAV_BY_ROLE[user.role] ?? [];

  return (
    <Box
      component="nav"
      aria-label="Main"
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'sidebar.main',
        pt: 3.875,
        pb: 2.75,
        px: { xs: 2.25, md: 1.25, lg: 2.25 },
        gap: 3.75,
      }}
    >
      <Logo />

      <Box
        sx={{
          mx: 1.25,
          py: 1.5,
          borderTop: `1px solid ${tokens.sidebarLine}`,
          borderBottom: `1px solid ${tokens.sidebarLine}`,
          display: 'flex',
          alignItems: 'center',
          gap: 1.125,
        }}
      >
        <ShieldOutlined sx={{ fontSize: 17, color: '#345a4e' }} />
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700 }}>{ROLE_LABELS[user.role]} workspace</Typography>
          <Typography color="text.secondary" noWrap component="p" sx={{ fontSize: 10 }}>
            {user.job_title ?? 'ACME delivery'}
          </Typography>
        </Box>
      </Box>

      <Box>
        <Typography variant="overline" color="text.secondary" component="p" sx={{ px: 1.625, pb: 0.5 }}>
          Workspace
        </Typography>
        <List disablePadding sx={{ display: 'grid', gap: 0.625 }}>
          {items.map(({ path, label, icon: Icon }) => (
            <ListItemButton
              key={path}
              component={NavLink}
              to={path}
              end={path === '/'}
              onClick={onNavigate}
              sx={{
                borderRadius: '5px',
                py: 1.375,
                px: 1.625,
                color: '#536b68',
                '&:hover': { bgcolor: tokens.sidebarHover },
                '&.active': { bgcolor: 'sidebar.active', color: '#204b47' },
                '&.active .MuiListItemText-primary': { fontWeight: 700 },
              }}
            >
              <ListItemIcon sx={{ minWidth: 28, color: 'inherit' }}>
                <Icon sx={{ fontSize: 17 }} />
              </ListItemIcon>
              <ListItemText primary={label} primaryTypographyProps={{ fontSize: 13 }} />
            </ListItemButton>
          ))}
        </List>
      </Box>

      <Box sx={{ flexGrow: 1 }} />

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          px: 0.75,
          pt: 1.5,
          borderTop: `1px solid ${tokens.sidebarLine}`,
        }}
      >
        <Avatar sx={{ bgcolor: '#c8d9c4' }}>{initials(user)}</Avatar>
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700 }} noWrap>
            {user.first_name} {user.last_name}
          </Typography>
          <Typography color="text.secondary" component="p" noWrap sx={{ fontSize: 10 }}>
            {ROLE_LABELS[user.role]} · {user.username}
          </Typography>
        </Box>
        <Tooltip title="Log out">
          <IconButton size="small" onClick={logout} aria-label="Log out">
            <LogoutOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}

Sidebar.propTypes = {
  onNavigate: PropTypes.func,
};
