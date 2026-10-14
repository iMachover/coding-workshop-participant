import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { useAuth } from '../context/useAuth';

/**
 * Placeholder landing page shown after login. The real role-based dashboard
 * replaces this once the UI mockup is approved (see EMPLOYEE.md §6).
 */
export function HomePage() {
  const { user, logout } = useAuth();

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>
            Project Tracker
          </Typography>
          <Typography variant="body2" sx={{ mr: 2 }}>
            {user.first_name} {user.last_name} · {user.role}
          </Typography>
          <Button color="inherit" onClick={logout}>
            Log out
          </Button>
        </Toolbar>
      </AppBar>
      <Container sx={{ py: 4 }}>
        <Typography variant="h5" gutterBottom>
          Welcome, {user.first_name}
        </Typography>
        <Typography color="text.secondary">
          You are signed in as <strong>{user.username}</strong> ({user.role}). Your dashboard will appear here.
        </Typography>
      </Container>
    </Box>
  );
}
