import { Navigate, Outlet, useLocation } from 'react-router'

import useAuth from '../auth/useAuth'

/**
 * Renders the child routes only for a signed-in user. Others go to sign in, which
 * sends them back here afterwards.
 */
function ProtectedRoute() {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

export default ProtectedRoute
