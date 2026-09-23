import { Navigate, Outlet } from 'react-router'

import useAuth from '../auth/useAuth'
import { homePathFor } from '../utils/roles'

/**
 * Renders the child routes (sign in, sign up) only when nobody is signed in. A
 * signed-in user goes to the start page for their role.
 */
function GuestRoute() {
  const { user } = useAuth()
  return user ? <Navigate to={homePathFor(user.role)} replace /> : <Outlet />
}

export default GuestRoute
