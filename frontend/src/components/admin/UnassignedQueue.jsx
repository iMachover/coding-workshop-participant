import PropTypes from 'prop-types'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import Link from '@mui/material/Link'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import { Link as RouterLink } from 'react-router'

import useIsMobile from '../../hooks/useIsMobile'
import { formatAge, formatLocation, PRIORITIES } from '../../utils/ticketFormat'
import ErrorState from '../ErrorState'
import AssignEngineerForm from './AssignEngineerForm'
import { panelHeadingSx, panelSx, visuallyHiddenSx } from './panelStyles'
import { PriorityPill } from './TicketPills'

const ESCALATED_RED = '#B3261E'

/**
 * One ticket waiting for an engineer: priority, number (a link to its details), title
 * and how long it has waited, then a one-click assign to the suggested engineer.
 */
function QueueItem({ ticket, engineers, onAssigned }) {
  return (
    <Box component="li" sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, px: 2, py: 1, borderTop: 1, borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 13, minWidth: 0 }}>
        <PriorityPill priority={ticket.priority} />
        <Link component={RouterLink} to={`/admin/tickets/${ticket.ticket_id}`} underline="hover" sx={{ fontWeight: 600, flex: 'none' }}>
          #{ticket.ticket_id}
        </Link>
        <Box component="span" title={ticket.title} sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {ticket.title}
        </Box>
        {ticket.escalation_requested && (
          <Box component="span" sx={{ flex: 'none', fontSize: 11, fontWeight: 600, color: ESCALATED_RED }}>
            Escalated
          </Box>
        )}
        <Box
          component="span"
          aria-label={`waiting ${formatAge(ticket.created_at)}`}
          sx={{ ml: 'auto', pl: 1, flex: 'none', fontSize: 12, color: 'text.secondary' }}
        >
          {formatAge(ticket.created_at)}
        </Box>
      </Box>
      <AssignEngineerForm ticketId={ticket.ticket_id} engineers={engineers} onAssigned={onAssigned} compact />
    </Box>
  )
}

/** The phone version: a card with the title on its own line, where it and its building fit. */
function QueueCard({ ticket, engineers, onAssigned }) {
  return (
    <Card component="li" sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 12, color: 'text.secondary' }}>
        <PriorityPill priority={ticket.priority} />
        <Link component={RouterLink} to={`/admin/tickets/${ticket.ticket_id}`} underline="hover" sx={{ fontWeight: 600 }}>
          #{ticket.ticket_id}
        </Link>
        {ticket.escalation_requested && (
          <Box component="span" sx={{ fontSize: 11, fontWeight: 600, color: ESCALATED_RED }}>
            Escalated
          </Box>
        )}
        <Box component="span" aria-label={`waiting ${formatAge(ticket.created_at)}`} sx={{ ml: 'auto' }}>
          {formatAge(ticket.created_at)} ago
        </Box>
      </Box>
      <Box>
        <Box sx={{ fontSize: 14, fontWeight: 500 }}>{ticket.title}</Box>
        <Box sx={{ fontSize: 12, color: 'text.secondary' }}>{formatLocation(ticket)}</Box>
      </Box>
      <AssignEngineerForm ticketId={ticket.ticket_id} engineers={engineers} onAssigned={onAssigned} compact />
    </Card>
  )
}

const engineersShape = PropTypes.shape({
  data: PropTypes.array,
  error: PropTypes.instanceOf(Error),
  reload: PropTypes.func.isRequired,
})

const ticketShape = PropTypes.shape({
  ticket_id: PropTypes.number.isRequired,
  title: PropTypes.string.isRequired,
  priority: PropTypes.oneOf(Object.keys(PRIORITIES)).isRequired,
  escalation_requested: PropTypes.bool.isRequired,
  building_name: PropTypes.string.isRequired,
  created_at: PropTypes.string.isRequired,
})

QueueItem.propTypes = {
  ticket: ticketShape.isRequired,
  engineers: engineersShape.isRequired,
  onAssigned: PropTypes.func.isRequired,
}

QueueCard.propTypes = QueueItem.propTypes

/**
 * The admin's triage queue: active tickets with no engineer yet, P1 first, then the
 * longest-waiting, as the API sorts them. Each can be assigned in place; `onAssigned`
 * gets the updated ticket. Long lists scroll inside the panel. On phones (a tab of its
 * own, which shows the count) each ticket is a card and the page scrolls instead.
 */
function UnassignedQueue({ queue, engineers, onAssigned, sx }) {
  const isMobile = useIsMobile()
  const firstLoad = queue.loading && queue.tickets.length === 0
  // Inside the desktop panel, states line up with its padding; on phones there's no panel.
  const statePad = isMobile ? undefined : { px: 2, pb: 2 }
  let content
  if (queue.error) {
    content = (
      <Box sx={statePad}>
        <ErrorState message={queue.error.message} onRetry={queue.reload} />
      </Box>
    )
  } else if (firstLoad) {
    content = (
      <Box sx={statePad}>
        <Skeleton variant="rounded" height={120} aria-label="Loading unassigned tickets" />
      </Box>
    )
  } else if (queue.tickets.length === 0) {
    content = (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 2, borderTop: isMobile ? 0 : 1, borderColor: 'divider', fontSize: 13, color: 'text.secondary' }}>
        <CheckCircleIcon aria-hidden="true" fontSize="small" sx={{ color: 'success.main' }} />
        Every active ticket has an engineer.
      </Box>
    )
  } else if (isMobile) {
    content = (
      <Box component="ul" aria-label="Unassigned tickets" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {queue.tickets.map((t) => (
          <QueueCard key={t.ticket_id} ticket={t} engineers={engineers} onAssigned={onAssigned} />
        ))}
      </Box>
    )
  } else {
    content = (
      <Box component="ul" aria-label="Unassigned tickets" sx={{ listStyle: 'none', m: 0, p: 0, overflow: 'auto', maxHeight: { xs: 400, lg: 'none' }, minHeight: 0 }}>
        {queue.tickets.map((t) => (
          <QueueItem key={t.ticket_id} ticket={t} engineers={engineers} onAssigned={onAssigned} />
        ))}
      </Box>
    )
  }

  const count = queue.tickets.length
  const Frame = isMobile ? Box : Card
  return (
    <Frame component="section" aria-labelledby="unassigned-title" sx={isMobile ? undefined : { ...panelSx, ...sx }}>
      <Box sx={isMobile ? visuallyHiddenSx : { display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 1, px: 2, pt: 1.5, pb: 1, flex: 'none' }}>
        <Typography id="unassigned-title" component="h2" sx={panelHeadingSx}>
          Needs an engineer
        </Typography>
        {!queue.error && !firstLoad && (
          <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary' }}>
            <span aria-label={`${count} unassigned`}>{count}</span> unassigned · P1 first, then oldest
          </Typography>
        )}
      </Box>
      {content}
    </Frame>
  )
}

UnassignedQueue.propTypes = {
  queue: PropTypes.shape({
    tickets: PropTypes.arrayOf(ticketShape).isRequired,
    loading: PropTypes.bool.isRequired,
    error: PropTypes.instanceOf(Error),
    reload: PropTypes.func.isRequired,
  }).isRequired,
  engineers: engineersShape.isRequired,
  onAssigned: PropTypes.func.isRequired,
  // Extra styles from the page, e.g. how much of the column the panel may take.
  sx: PropTypes.object,
}

export default UnassignedQueue
