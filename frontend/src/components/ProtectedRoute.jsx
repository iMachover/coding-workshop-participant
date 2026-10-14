import PropTypes from 'prop-types';
import { Navigate, useLocation } from 'react-router-dom';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { useAuth } from '../context/useAuth';
import { ForbiddenPage } from '../pages/ForbiddenPage';

/**
 * Renders children only for an authenticated user; otherwise redirects to
 * /login and remembers where the user was heading. With `roles`, a signed-in
 * user whose role is not listed sees the "no access" page instead.
 *
 * This guards the UI only. The API checks the role again on every request.
 *
 * @param {{ children: import('react').ReactNode, roles?: string[] }} props
 */
export function ProtectedRoute({ children, roles }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }} aria-busy="true">
        <CircularProgress aria-label="Checking your session" />
      </Box>
    );
  }

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (roles && !roles.includes(user.role)) {
    return <ForbiddenPage />;
  }

  return children;
}

ProtectedRoute.propTypes = {
  children: PropTypes.node.isRequired,
  roles: PropTypes.arrayOf(PropTypes.oneOf(['employee', 'manager', 'admin'])),
};
