import PropTypes from 'prop-types'
import Box from '@mui/material/Box'
import Tooltip from '@mui/material/Tooltip'

import { PRIORITIES, STATUSES } from '../../utils/ticketFormat'

// Background and text colors, from the admin dashboard mockup. Every pair passes AA contrast.
const PRIORITY_COLORS = {
  P1: ['#D32F2F', '#FFFFFF'],
  P2: ['#FFE0B2', '#7A3E00'],
  P3: ['#E6F0F8', '#003B70'],
}

const STATUS_COLORS = {
  open: ['#E6F0F8', '#003B70'],
  in_progress: ['#FFF3E0', '#8A4B00'],
  blocked: ['#FDECEA', '#B3261E'],
  resolved: ['#E8F5E9', '#1B5E20'],
  closed: ['#EEEEEE', '#424242'],
}

/** A small rounded label; the text carries the meaning, color only backs it up. */
function Pill({ bg, fg, height, fontSize, fontWeight, children, ...rest }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        flex: 'none',
        height,
        px: 1,
        borderRadius: height / 2,
        bgcolor: bg,
        color: fg,
        fontSize,
        fontWeight,
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
      {...rest}
    >
      {children}
    </Box>
  )
}

Pill.propTypes = {
  bg: PropTypes.string.isRequired,
  fg: PropTypes.string.isRequired,
  height: PropTypes.number.isRequired,
  fontSize: PropTypes.number.isRequired,
  fontWeight: PropTypes.number.isRequired,
  children: PropTypes.node.isRequired,
}

/**
 * P1 / P2 / P3 as a compact pill for the admin dashboard; P1 is filled red. Staff screens
 * only. Like PriorityChip, the tooltip (also the accessible name) says what it means.
 */
export function PriorityPill({ priority }) {
  const { label, description } = PRIORITIES[priority]
  const [bg, fg] = PRIORITY_COLORS[priority]
  const meaning = `Priority ${label}: ${description}`
  return (
    <Tooltip title={meaning}>
      <Pill bg={bg} fg={fg} height={20} fontSize={11} fontWeight={700} aria-label={meaning} role="img">
        {label}
      </Pill>
    </Tooltip>
  )
}

PriorityPill.propTypes = {
  priority: PropTypes.oneOf(Object.keys(PRIORITIES)).isRequired,
}

/** A ticket status as a tinted pill, e.g. "In Progress" on light orange. */
export function StatusPill({ status }) {
  const [bg, fg] = STATUS_COLORS[status]
  return (
    <Pill bg={bg} fg={fg} height={22} fontSize={12} fontWeight={500}>
      {STATUSES[status].label}
    </Pill>
  )
}

StatusPill.propTypes = {
  status: PropTypes.oneOf(Object.keys(STATUSES)).isRequired,
}
