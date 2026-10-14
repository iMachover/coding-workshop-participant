import PropTypes from 'prop-types';
import { NavLink } from 'react-router-dom';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
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

function Logo() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1.5 }}>
      <Box
        aria-hidden="true"
        sx={{
          width: 30,
          height: 30,
          borderRadius: 1,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          display: 'grid',
          placeItems: 'center',
          fontWeight: 700,
          fontSize: 15,
          fontStyle: 'italic',
        }}
      >
        //
      </Box>
      <Typography component="span" sx={{ fontWeight: 800, fontSize: 20, letterSpacing: '-0.02em' }}>
        ACME
        <Typography component="span" sx={{ fontWeight: 600, fontSize: 11, ml: 0.5 }}>
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
 * Left navigation: logo, workspace card, the signed-in role's pages and the
 * user chip with log out. Only pages the role may open are listed.
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
      sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'sidebar.main', py: 3, px: 2, gap: 2.5 }}
    >
      <Logo />

      <Divider />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1 }}>
        <ShieldOutlined fontSize="small" sx={{ color: 'text.secondary' }} />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {ROLE_LABELS[user.role]} workspace
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="p">
            {user.job_title ?? 'ACME delivery'}
          </Typography>
        </Box>
      </Box>
      <Divider />

      <Box>
        <Typography variant="overline" color="text.secondary" sx={{ px: 1.5 }}>
          Workspace
        </Typography>
        <List disablePadding sx={{ display: 'grid', gap: 0.5, mt: 0.5 }}>
          {items.map(({ path, label, icon: Icon }) => (
            <ListItemButton
              key={path}
              component={NavLink}
              to={path}
              end={path === '/'}
              onClick={onNavigate}
              sx={{
                borderRadius: 1.5,
                py: 1,
                color: 'text.secondary',
                '&.active': { bgcolor: 'sidebar.active', color: 'text.primary', fontWeight: 600 },
                '&.active .MuiListItemText-primary': { fontWeight: 600 },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}>
                <Icon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={label} primaryTypographyProps={{ variant: 'body2' }} />
            </ListItemButton>
          ))}
        </List>
      </Box>

      <Box sx={{ flexGrow: 1 }} />

      <Divider />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 0.5 }}>
        <Avatar sx={{ width: 34, height: 34, fontSize: 13, bgcolor: 'sidebar.active', color: 'text.primary' }}>
          {initials(user)}
        </Avatar>
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
            {user.first_name} {user.last_name}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="p" noWrap>
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
