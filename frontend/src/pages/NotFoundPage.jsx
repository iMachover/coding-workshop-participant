import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'

/** Shown for any URL that doesn't match a route. */
function NotFoundPage() {
  return (
    <Card>
      <CardContent>
        <Typography variant="h4" component="h1" gutterBottom>
          Page not found
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          The page you&apos;re looking for doesn&apos;t exist.
        </Typography>
        <Button variant="contained" component={RouterLink} to="/">
          Go to the start page
        </Button>
      </CardContent>
    </Card>
  )
}

export default NotFoundPage
