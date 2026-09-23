import PropTypes from 'prop-types'
import { Navigate, Outlet, useLocation } from 'react-router'

import useAuth from '../auth/useAuth'
import NoAccessPage from '../pages/NoAccessPage'

/**
 * Renders the child routes only for a signed-in user. Others go to sign in, which
 * sends them back here afterwards. With `roles`, a signed-in user with any other
 * role sees NoAccessPage instead (the API would answer 403 anyway).
 */
function ProtectedRoute({ roles }) {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (roles && !roles.includes(user.role)) return <NoAccessPage />
  return <Outlet />
}

ProtectedRoute.propTypes = {
  roles: PropTypes.arrayOf(PropTypes.oneOf(['employee', 'engineer', 'admin'])),
}

export default ProtectedRoute
