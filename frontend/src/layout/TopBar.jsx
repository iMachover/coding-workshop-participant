import PropTypes from 'prop-types';
import { useLocation } from 'react-router-dom';
import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import MenuOutlined from '@mui/icons-material/MenuOutlined';
import NavigateNextOutlined from '@mui/icons-material/NavigateNextOutlined';
import { useAuth } from '../context/useAuth';
import { ROUTE_ROLES, findNavItem } from '../config/navigation';

const today = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/**
 * Top strip: menu button (small screens), breadcrumb for the current page, today's date.
 *
 * @param {{ onMenuClick: () => void }} props
 */
export function TopBar({ onMenuClick }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  // A real page this role can't open reads "No access"; anything else is not found.
  const page = findNavItem(user.role, pathname)?.label ?? (ROUTE_ROLES[pathname] ? 'No access' : 'Page not found');

  return (
    <Box
      component="header"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: { xs: 2, md: 4 },
        minHeight: 56,
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'background.default',
      }}
    >
      <IconButton onClick={onMenuClick} aria-label="Open navigation" sx={{ display: { md: 'none' }, ml: -1 }}>
        <MenuOutlined />
      </IconButton>
      <Breadcrumbs separator={<NavigateNextOutlined fontSize="small" />} aria-label="Breadcrumb" sx={{ flexGrow: 1 }}>
        <Typography variant="body2" color="text.secondary">
          Workspace
        </Typography>
        <Typography variant="body2" color="text.primary" aria-current="page">
          {page}
        </Typography>
      </Breadcrumbs>
      <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
        {today.format(new Date())}
      </Typography>
    </Box>
  );
}

TopBar.propTypes = {
  onMenuClick: PropTypes.func.isRequired,
};
