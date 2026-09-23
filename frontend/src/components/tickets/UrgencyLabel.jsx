import PropTypes from 'prop-types'

import { URGENCIES } from '../../utils/ticketFormat'
import LabelWithDot from './LabelWithDot'

/** How urgent the employee said the issue is, e.g. "● High". */
function UrgencyLabel({ urgency }) {
  const { label, dot } = URGENCIES[urgency]
  return <LabelWithDot label={label} dot={dot} />
}

UrgencyLabel.propTypes = {
  urgency: PropTypes.oneOf(Object.keys(URGENCIES)).isRequired,
}

export default UrgencyLabel
