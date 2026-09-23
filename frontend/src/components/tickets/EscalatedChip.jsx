import Chip from '@mui/material/Chip'
import PriorityHighIcon from '@mui/icons-material/PriorityHigh'

/** Marks a ticket whose employee asked a Facility Admin to review it. The word carries the meaning. */
function EscalatedChip() {
  return <Chip icon={<PriorityHighIcon />} label="Escalated" size="small" color="warning" variant="outlined" />
}

export default EscalatedChip
