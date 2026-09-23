import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'

import useAuth from '../auth/useAuth'
import { homePathFor, roleLabel } from '../utils/roles'

/** Shown when a signed-in user opens a page their role can't use. */
function NoAccessPage() {
  const { user } = useAuth()

  return (
    <Card>
      <CardContent>
        <Typography variant="h4" component="h1" gutterBottom>
          You don&apos;t have access to this
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          This page isn&apos;t available to your role. You&apos;re signed in as {roleLabel(user.role)}.
        </Typography>
        <Button variant="contained" component={RouterLink} to={homePathFor(user.role)}>
          Go to my start page
        </Button>
      </CardContent>
    </Card>
  )
}

export default NoAccessPage
