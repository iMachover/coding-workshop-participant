import { Navigate, Route, Routes } from 'react-router'

import useAuth from './auth/useAuth'
import AppLayout from './components/AppLayout'
import AdminDashboardPage from './pages/AdminDashboardPage'
import AdminTicketDetailsPage from './pages/AdminTicketDetailsPage'
import CreateTicketPage from './pages/CreateTicketPage'
import GuestRoute from './components/GuestRoute'
import ProtectedRoute from './components/ProtectedRoute'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import NotFoundPage from './pages/NotFoundPage'
import RegisterPage from './pages/RegisterPage'
import StaffHomePage from './pages/StaffHomePage'
import TicketDetailsPage from './pages/TicketDetailsPage'
import { homePathFor } from './utils/roles'

/** "/" goes to the signed-in user's start page for their role, otherwise to sign in. */
function HomeRedirect() {
  const { user } = useAuth()
  return <Navigate to={user ? homePathFor(user.role) : '/login'} replace />
}

/**
 * Route table: sign-in pages for guests, then one group per role. Employees report
 * and follow their own tickets; Facility Admins triage every ticket; engineers have
 * a placeholder start page for now.
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
        <Route element={<ProtectedRoute roles={['employee']} />}>
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="tickets/new" element={<CreateTicketPage />} />
          <Route path="tickets/:ticketId" element={<TicketDetailsPage />} />
        </Route>
        <Route element={<ProtectedRoute roles={['engineer']} />}>
          <Route path="engineer" element={<StaffHomePage />} />
        </Route>
        <Route element={<ProtectedRoute roles={['admin']} />}>
          <Route path="admin" element={<AdminDashboardPage />} />
          <Route path="admin/tickets/:ticketId" element={<AdminTicketDetailsPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export default App
