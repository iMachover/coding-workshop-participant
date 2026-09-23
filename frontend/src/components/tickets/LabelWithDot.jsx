import PropTypes from 'prop-types'
import Box from '@mui/material/Box'

/**
 * Text label with a small colored dot. The text carries the meaning; the dot is a
 * visual aid only, so color is never the sole signal and text keeps full contrast.
 */
function LabelWithDot({ label, dot, title }) {
  return (
    <Box
      component="span"
      title={title}
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, whiteSpace: 'nowrap' }}
    >
      <Box
        component="span"
        aria-hidden="true"
        sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: dot, flexShrink: 0 }}
      />
      {label}
    </Box>
  )
}

LabelWithDot.propTypes = {
  label: PropTypes.string.isRequired,
  dot: PropTypes.string.isRequired,
  title: PropTypes.string,
}

export default LabelWithDot
