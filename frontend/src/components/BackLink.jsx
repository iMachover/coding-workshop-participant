import PropTypes from 'prop-types'
import Link from '@mui/material/Link'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { Link as RouterLink } from 'react-router'

/** "← Back to …" link at the top of a details page. */
function BackLink({ to, children }) {
  return (
    <Link component={RouterLink} to={to} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <ArrowBackIcon fontSize="small" aria-hidden="true" />
      {children}
    </Link>
  )
}

BackLink.propTypes = {
  to: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
}

export default BackLink
