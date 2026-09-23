import PropTypes from 'prop-types'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'

/**
 * Narrow centered card for the sign-in and sign-up forms. Full width on phones.
 */
function AuthCard({ title, subtitle, children }) {
  return (
    <Card sx={{ maxWidth: 480, mx: 'auto', mt: { xs: 0, sm: 4 } }}>
      <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
        <Typography variant="h4" component="h1" gutterBottom>
          {title}
        </Typography>
        {subtitle && (
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            {subtitle}
          </Typography>
        )}
        {children}
      </CardContent>
    </Card>
  )
}

AuthCard.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  children: PropTypes.node.isRequired,
}

export default AuthCard
