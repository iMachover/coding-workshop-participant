import Alert from '@mui/material/Alert'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import useAuth from '../auth/useAuth'
import { roleLabel } from '../utils/roles'

// What each staff role will get here. Placeholder until their API routes exist.
const COMING_NEXT = {
  engineer: 'Your ticket queue is on its way. Assigned tickets, status changes and blocking will appear here.',
  admin: 'The admin dashboard is on its way. All tickets, assigning engineers and managing roles will appear here.',
}

/**
 * Start page for engineers (/engineer) and facility admins (/admin). It makes no
 * API calls: the employee ticket routes would answer 403 for these roles.
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
      <Alert severity="info">{COMING_NEXT[user.role]}</Alert>
    </Stack>
  )
}

export default StaffHomePage
