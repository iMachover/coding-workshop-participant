import PropTypes from 'prop-types'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'

import { PRIORITIES } from '../../utils/ticketFormat'

/**
 * P1 / P2 / P3 as a small chip; P1 filled red so it stands out. Staff screens only:
 * employees never see priority. The tooltip, also the accessible name, says what it means.
 */
function PriorityChip({ priority }) {
  const { label, description, chip } = PRIORITIES[priority]
  const meaning = `Priority ${label}: ${description}`
  return (
    <Tooltip title={meaning}>
      <Chip label={label} aria-label={meaning} size="small" sx={{ fontWeight: 700 }} {...chip} />
    </Tooltip>
  )
}

PriorityChip.propTypes = {
  priority: PropTypes.oneOf(Object.keys(PRIORITIES)).isRequired,
}

export default PriorityChip
