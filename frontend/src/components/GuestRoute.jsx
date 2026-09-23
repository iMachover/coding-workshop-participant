import { Navigate, Outlet } from 'react-router'

import useAuth from '../auth/useAuth'

/**
 * Renders the child routes (sign in, sign up) only when nobody is signed in.
 */
function GuestRoute() {
  const { user } = useAuth()
  return user ? <Navigate to="/dashboard" replace /> : <Outlet />
}

export default GuestRoute
