import { BrowserRouter, Route, Routes } from 'react-router-dom';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { theme } from './theme';
import { AuthProvider } from './context/AuthProvider';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ROUTE_ROLES } from './config/navigation';
import { RefreshProvider } from './context/RefreshProvider';
import { ToastProvider } from './context/ToastProvider';
import { AppShell } from './layout/AppShell';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { OverviewPage } from './pages/overview/OverviewPage';
import { ArchivesPage } from './pages/archives/ArchivesPage';
import { AuditPage } from './pages/audit/AuditPage';
import { HoursPage } from './pages/hours/HoursPage';
import { PeoplePage } from './pages/people/PeoplePage';
import { ProjectsPage } from './pages/projects/ProjectsPage';
import { ReportsPage } from './pages/reports/ReportsPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { TeamManagerPage } from './pages/team/TeamManagerPage';
import { TeamsEmployeePage } from './pages/teams/TeamsEmployeePage';

/** Every sidebar page, by path. (The placeholder stays for any path added later.) */
const BUILT_PAGES = {
  '/': OverviewPage,
  '/projects': ProjectsPage,
  '/people': PeoplePage,
  '/team': TeamManagerPage,
  '/teams': TeamsEmployeePage,
  '/hours': HoursPage,
  '/audit': AuditPage,
  '/archives': ArchivesPage,
  '/reports': ReportsPage,
  '/settings': SettingsPage,
};

/**
 * Application root: theme, auth state and routing.
 *
 * Every signed-in page sits inside AppShell. Each path is limited to the roles
 * whose sidebar lists it (config/navigation.js); other roles get the no-access page.
 */
function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <RefreshProvider>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route
                  element={
                    <ProtectedRoute>
                      <AppShell />
                    </ProtectedRoute>
                  }
                >
                  {Object.entries(ROUTE_ROLES).map(([path, roles]) => {
                    const Page = BUILT_PAGES[path];
                    return (
                      <Route
                        key={path}
                        path={path}
                        element={
                          <ProtectedRoute roles={roles}>{Page ? <Page /> : <PlaceholderPage path={path} />}</ProtectedRoute>
                        }
                      />
                    );
                  })}
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Routes>
            </RefreshProvider>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
