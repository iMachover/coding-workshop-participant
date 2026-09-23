import { useState } from 'react'
import PropTypes from 'prop-types'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'

import { ApiError } from '../../services/apiClient'
import { formatAge, formatLocation, PRIORITIES, STATUSES } from '../../utils/ticketFormat'
import EscalatedChip from '../tickets/EscalatedChip'
import PriorityChip from '../tickets/PriorityChip'
import StatusLabel from '../tickets/StatusLabel'

const HEADINGS = { current: 'Current ticket', next: 'Up next' }

/** "Updated just now" or "Updated 3 h ago". */
function updatedPhrase(iso) {
  const age = formatAge(iso)
  return age === 'just now' ? 'Updated just now' : `Updated ${age} ago`
}

/**
 * The engineer's focus: the ticket they're working on, or the one to pick up next (see
 * pickCurrentTicket), which they can start right here. With nothing to work on, it says so.
 * `onStart(ticket)` starts work on it and resolves once the dashboard has the change.
 */
function CurrentTicketCard({ pick, onStart }) {
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  if (!pick) {
    return (
      <Card component="section" aria-labelledby="current-title">
        <CardContent>
          <Typography id="current-title" component="h2" variant="h6">
            Nothing to work on right now
          </Typography>
          <Typography color="text.secondary">
            New tickets appear here when an admin assigns them to you.
          </Typography>
        </CardContent>
      </Card>
    )
  }

  const { ticket: t, kind } = pick
  const handleStart = async () => {
    setStarting(true)
    setError('')
    try {
      await onStart(t)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setStarting(false)
    }
  }

  return (
    <Card component="section" aria-labelledby="current-title" sx={{ borderLeft: 4, borderLeftColor: 'primary.main' }}>
      <CardContent>
        <Typography id="current-title" variant="overline" component="h2" color="text.secondary">
          {HEADINGS[kind]}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1, mb: 1 }}>
          <PriorityChip priority={t.priority} />
          <StatusLabel status={t.status} />
          {t.escalation_requested && <EscalatedChip />}
        </Stack>
        <Typography variant="h5" component="p" gutterBottom>
          #{t.ticket_id} {t.title}
        </Typography>
        <Typography color="text.secondary">
          {formatLocation(t)} · {t.created_by_name}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {updatedPhrase(t.updated_at)}
        </Typography>
        <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          {kind === 'next' && (
            <Button
              variant="contained"
              onClick={handleStart}
              disabled={starting}
              startIcon={starting ? <CircularProgress size={16} color="inherit" /> : null}
            >
              {starting ? 'Starting…' : 'Start work'}
            </Button>
          )}
          <Button
            variant={kind === 'next' ? 'outlined' : 'contained'}
            component={RouterLink}
            to={`/engineer/tickets/${t.ticket_id}`}
          >
            Open ticket
          </Button>
        </Stack>
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

CurrentTicketCard.propTypes = {
  pick: PropTypes.shape({
    kind: PropTypes.oneOf(Object.keys(HEADINGS)).isRequired,
    ticket: PropTypes.shape({
      ticket_id: PropTypes.number.isRequired,
      title: PropTypes.string.isRequired,
      priority: PropTypes.oneOf(Object.keys(PRIORITIES)).isRequired,
      status: PropTypes.oneOf(Object.keys(STATUSES)).isRequired,
      escalation_requested: PropTypes.bool.isRequired,
      building_name: PropTypes.string.isRequired,
      created_by_name: PropTypes.string.isRequired,
      updated_at: PropTypes.string.isRequired,
    }).isRequired,
  }),
  onStart: PropTypes.func.isRequired,
}

export default CurrentTicketCard
