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
import { tokens } from '../theme';

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
        px: { xs: 2, md: 2.5, lg: 3.5 },
        minHeight: { xs: 49, md: 56 },
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: tokens.topbar,
        fontSize: 12,
      }}
    >
      <IconButton onClick={onMenuClick} aria-label="Open navigation" sx={{ display: { md: 'none' }, ml: -1 }}>
        <MenuOutlined />
      </IconButton>
      <Breadcrumbs
        separator={<NavigateNextOutlined sx={{ fontSize: 14 }} />}
        aria-label="Breadcrumb"
        sx={{ flexGrow: 1, fontSize: 12, '& .MuiBreadcrumbs-separator': { mx: 1 } }}
      >
        <Typography color="text.secondary" sx={{ fontSize: 12 }}>
          Workspace
        </Typography>
        <Typography color="text.primary" aria-current="page" sx={{ fontSize: 12, fontWeight: 500 }}>
          {page}
        </Typography>
      </Breadcrumbs>
      <Typography color="text.secondary" sx={{ fontSize: 12, display: { xs: 'none', sm: 'block' } }}>
        {today.format(new Date())}
      </Typography>
    </Box>
  );
}

TopBar.propTypes = {
  onMenuClick: PropTypes.func.isRequired,
};
