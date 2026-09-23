import Alert from '@mui/material/Alert'
import { useLocation } from 'react-router'

import PagePlaceholder from '../components/PagePlaceholder'

/** Sign in. The form is built in F3; the post-registration message is already wired. */
function LoginPage() {
  const registeredEmail = useLocation().state?.registeredEmail

  return (
    <>
      {registeredEmail && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Account created for {registeredEmail}. Please sign in.
        </Alert>
      )}
      <PagePlaceholder title="Sign in" step="F3" />
    </>
  )
}

export default LoginPage
