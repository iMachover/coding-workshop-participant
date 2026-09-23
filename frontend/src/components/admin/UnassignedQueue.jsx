import PropTypes from 'prop-types'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Grid from '@mui/material/Grid'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'

import { formatAge, formatLocation, PRIORITIES } from '../../utils/ticketFormat'
import ErrorState from '../ErrorState'
import EscalatedChip from '../tickets/EscalatedChip'
import PriorityChip from '../tickets/PriorityChip'
import StatusLabel from '../tickets/StatusLabel'

/** One ticket waiting for an engineer. The whole card links to its details. */
function QueueCard({ ticket }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardActionArea component={RouterLink} to={`/admin/tickets/${ticket.ticket_id}`} sx={{ height: '100%' }}>
        <CardContent>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1, mb: 1 }}>
            <PriorityChip priority={ticket.priority} />
            {ticket.escalation_requested && <EscalatedChip />}
            <StatusLabel status={ticket.status} />
          </Stack>
          <Typography fontWeight={600}>
            #{ticket.ticket_id} {ticket.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {formatLocation(ticket)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {ticket.created_by_name} · waiting {formatAge(ticket.created_at)}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  )
}

QueueCard.propTypes = {
  ticket: PropTypes.shape({
    ticket_id: PropTypes.number.isRequired,
    title: PropTypes.string.isRequired,
    status: PropTypes.string.isRequired,
    priority: PropTypes.oneOf(Object.keys(PRIORITIES)).isRequired,
    escalation_requested: PropTypes.bool.isRequired,
    building_name: PropTypes.string.isRequired,
    created_by_name: PropTypes.string.isRequired,
    created_at: PropTypes.string.isRequired,
  }).isRequired,
}

/**
 * The admin's triage queue: active tickets with no engineer yet, P1 first, then the
 * longest-waiting, as the API sorts them. Always on screen, above the full list.
 */
function UnassignedQueue({ queue }) {
  let content
  if (queue.error) {
    content = <ErrorState message={queue.error.message} onRetry={queue.reload} />
  } else if (queue.loading && queue.tickets.length === 0) {
    content = <Skeleton variant="rounded" height={120} aria-label="Loading unassigned tickets" />
  } else if (queue.tickets.length === 0) {
    content = <Alert severity="success">Every active ticket has an engineer.</Alert>
  } else {
    content = (
      <Grid container spacing={2} component="ul" aria-label="Unassigned tickets" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {queue.tickets.map((t) => (
          <Grid key={t.ticket_id} component="li" size={{ xs: 12, md: 6, lg: 4 }}>
            <QueueCard ticket={t} />
          </Grid>
        ))}
      </Grid>
    )
  }

  const showCount = !queue.error && !(queue.loading && queue.tickets.length === 0)
  return (
    <Box component="section" aria-labelledby="unassigned-title">
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
        <Typography id="unassigned-title" component="h2" variant="h5">
          Needs an engineer
        </Typography>
        {showCount && (
          <Chip
            label={queue.tickets.length}
            aria-label={`${queue.tickets.length} unassigned`}
            color={queue.tickets.length > 0 ? 'primary' : 'default'}
            size="small"
          />
        )}
      </Stack>
      {content}
    </Box>
  )
}

UnassignedQueue.propTypes = {
  queue: PropTypes.shape({
    tickets: PropTypes.arrayOf(QueueCard.propTypes.ticket).isRequired,
    loading: PropTypes.bool.isRequired,
    error: PropTypes.instanceOf(Error),
    reload: PropTypes.func.isRequired,
  }).isRequired,
}

export default UnassignedQueue
