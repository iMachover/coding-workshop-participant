import { Navigate, Route, Routes } from 'react-router'

import useAuth from './auth/useAuth'
import AppLayout from './components/AppLayout'
import GuestRoute from './components/GuestRoute'
import ProtectedRoute from './components/ProtectedRoute'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import NotFoundPage from './pages/NotFoundPage'
import RegisterPage from './pages/RegisterPage'

/** "/" goes to the dashboard when signed in, otherwise to sign in. */
function HomeRedirect() {
  const { user } = useAuth()
  return <Navigate to={user ? '/dashboard' : '/login'} replace />
}

/**
 * Route table: sign-in pages for guests, everything else for signed-in users.
 */
function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomeRedirect />} />
        <Route element={<GuestRoute />}>
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route path="dashboard" element={<DashboardPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export default App
