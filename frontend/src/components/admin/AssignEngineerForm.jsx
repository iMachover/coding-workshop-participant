import { useState } from 'react'
import PropTypes from 'prop-types'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import { assignTicket } from '../../services/adminTicketService'
import { ApiError } from '../../services/apiClient'
import { formatEngineerLoad } from '../../utils/ticketFormat'
import ErrorState from '../ErrorState'

const engineerShape = PropTypes.shape({
  user_id: PropTypes.number.isRequired,
  full_name: PropTypes.string.isRequired,
  active_count: PropTypes.number.isRequired,
  p1_count: PropTypes.number.isRequired,
})

/**
 * Pick an engineer and assign (or reassign) the ticket. The dropdown lists engineers
 * lightest load first, as the API sorts them; the current one is shown but disabled.
 * `compact` is the smaller version for the unassigned queue's cards.
 */
function AssignEngineerForm({ ticketId, currentEngineerId = null, engineers, onAssigned, compact = false }) {
  const [engineerId, setEngineerId] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const verb = currentEngineerId ? 'Reassign' : 'Assign'

  if (engineers.error) {
    // On the dashboard the workload panel already shows this error (with a retry) once.
    return compact ? null : <ErrorState message={engineers.error.message} onRetry={engineers.reload} />
  }
  if (engineers.data?.length === 0) {
    return <Typography color="text.secondary">No engineers yet. Give someone the engineer role first.</Typography>
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSending(true)
    setError('')
    try {
      const ticket = await assignTicket(ticketId, engineerId)
      setEngineerId('')
      onAssigned(ticket)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const size = compact ? 'small' : 'medium'
  return (
    <Stack component="form" onSubmit={handleSubmit} noValidate spacing={1.5} sx={{ width: '100%' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
        <TextField
          select
          label={compact ? 'Assign to' : 'Engineer'}
          size={size}
          value={engineerId}
          onChange={(event) => {
            setEngineerId(event.target.value)
            setError('')
          }}
          disabled={sending || !engineers.data}
          helperText={!engineers.data ? 'Loading engineers…' : undefined}
          sx={{ flexGrow: 1, minWidth: 200 }}
        >
          {(engineers.data ?? []).map((e) => (
            <MenuItem key={e.user_id} value={String(e.user_id)} disabled={e.user_id === currentEngineerId}>
              {formatEngineerLoad(e)}
              {e.user_id === currentEngineerId && ' (current)'}
            </MenuItem>
          ))}
        </TextField>
        <Button
          type="submit"
          variant={compact ? 'outlined' : 'contained'}
          size={size}
          disabled={!engineerId || sending}
          startIcon={sending ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {sending ? `${verb}ing…` : verb}
        </Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  )
}

AssignEngineerForm.propTypes = {
  ticketId: PropTypes.number.isRequired,
  currentEngineerId: PropTypes.number,
  engineers: PropTypes.shape({
    data: PropTypes.arrayOf(engineerShape),
    error: PropTypes.instanceOf(Error),
    reload: PropTypes.func.isRequired,
  }).isRequired,
  onAssigned: PropTypes.func.isRequired,
  compact: PropTypes.bool,
}

export default AssignEngineerForm
