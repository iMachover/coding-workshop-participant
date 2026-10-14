import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';

/**
 * Validate the login form on the client before calling the API.
 * @param {{ username: string, password: string }} values
 * @returns {{ username?: string, password?: string }}
 */
function validate(values) {
  const errors = {};
  if (!values.username.trim()) {
    errors.username = 'Enter your username';
  }
  if (!values.password) {
    errors.password = 'Enter your password';
  }
  return errors;
}

/**
 * Username + password sign-in. Accounts are created by an administrator;
 * there is no self-registration.
 */
export function LoginPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState({ username: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = location.state?.from?.pathname || '/';

  if (status === 'authenticated') {
    return <Navigate to={redirectTo} replace />;
  }

  const handleChange = (event) => {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: undefined }));
    setFormError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const errors = validate(values);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setSubmitting(true);
    try {
      await login(values.username.trim(), values.password);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        setFieldErrors(error.fields);
      } else if (error instanceof ApiError) {
        setFormError(error.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container maxWidth="xs" sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
      <Paper elevation={3} sx={{ p: 4, width: '100%' }}>
        <Typography component="h1" variant="h5" gutterBottom>
          Project Tracker
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Sign in with the username and password provided by your administrator.
        </Typography>

        {formError && (
          <Alert severity="error" sx={{ mb: 2 }} role="alert">
            {formError}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} noValidate>
          <TextField
            id="username"
            name="username"
            label="Username"
            value={values.username}
            onChange={handleChange}
            error={Boolean(fieldErrors.username)}
            helperText={fieldErrors.username}
            autoComplete="username"
            autoFocus
            required
            fullWidth
            margin="normal"
            disabled={submitting}
            slotProps={{ htmlInput: { maxLength: 64 } }}
          />
          <TextField
            id="password"
            name="password"
            label="Password"
            type="password"
            value={values.password}
            onChange={handleChange}
            error={Boolean(fieldErrors.password)}
            helperText={fieldErrors.password}
            autoComplete="current-password"
            required
            fullWidth
            margin="normal"
            disabled={submitting}
            slotProps={{ htmlInput: { maxLength: 72 } }}
          />
          <Button
            type="submit"
            variant="contained"
            fullWidth
            size="large"
            disabled={submitting}
            sx={{ mt: 2 }}
            startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : null}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </Box>
      </Paper>
    </Container>
  );
}
