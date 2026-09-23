import Alert from '@mui/material/Alert'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import useAuth from '../auth/useAuth'
import { roleLabel } from '../utils/roles'

/**
 * Placeholder start page for engineers (/engineer) until their ticket queue exists.
 * It makes no API calls: the employee ticket routes would answer 403 for engineers.
 */
function StaffHomePage() {
  const { user } = useAuth()
  const label = roleLabel(user.role)

  return (
    <Stack spacing={3}>
      <div>
        <Typography variant="h4" component="h1">
          {label} workspace
        </Typography>
        <Typography color="text.secondary">
          Signed in as {user.full_name} · {label}
        </Typography>
      </div>
      <Alert severity="info">
        Your ticket queue is on its way. Assigned tickets, status changes and blocking will appear here.
      </Alert>
    </Stack>
  )
}

export default StaffHomePage
