import PropTypes from 'prop-types'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'

/**
 * Temporary stand-in for a page that a later step builds. Delete once all pages exist.
 */
function PagePlaceholder({ title, step }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="h4" component="h1" gutterBottom>
          {title}
        </Typography>
        <Typography color="text.secondary">This page is built in step {step}.</Typography>
      </CardContent>
    </Card>
  )
}

PagePlaceholder.propTypes = {
  title: PropTypes.string.isRequired,
  step: PropTypes.string.isRequired,
}

export default PagePlaceholder
