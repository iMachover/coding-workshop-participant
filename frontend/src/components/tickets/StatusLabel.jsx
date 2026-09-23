import PropTypes from 'prop-types'

import { STATUSES } from '../../utils/ticketFormat'
import LabelWithDot from './LabelWithDot'

/** A ticket status, e.g. "● In progress". */
function StatusLabel({ status }) {
  const { label, dot } = STATUSES[status]
  return <LabelWithDot label={label} dot={dot} />
}

StatusLabel.propTypes = {
  status: PropTypes.oneOf(Object.keys(STATUSES)).isRequired,
}

export default StatusLabel
