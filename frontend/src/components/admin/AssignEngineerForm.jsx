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
 * `compact` is the one-row version for the dashboard's unassigned queue: it has no visible
 * label ("Assign to" is its accessible name) and starts on the lightest-loaded engineer,
 * so assigning takes one click.
 */
function AssignEngineerForm({ ticketId, currentEngineerId = null, engineers, onAssigned, compact = false }) {
  const [engineerId, setEngineerId] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const verb = currentEngineerId ? 'Reassign' : 'Assign'
  // The queue suggests whoever has the least on their plate (the API's first engineer).
  // Derived rather than stored, so after a reload it follows the new lightest load.
  const suggested = compact && engineers.data?.length ? String(engineers.data[0].user_id) : ''
  const chosenId = engineerId || suggested

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
      const ticket = await assignTicket(ticketId, chosenId)
      setEngineerId('')
      onAssigned(ticket)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const size = compact ? 'small' : 'medium'
  // Compact controls are 32px on the desktop queue, 44px (a comfortable tap) on phones.
  const compactHeight = { xs: 44, sm: 32 }
  const compactSx = { '& .MuiInputBase-root': { height: compactHeight, fontSize: { xs: 14, sm: 13 } } }
  return (
    <Stack component="form" onSubmit={handleSubmit} noValidate spacing={compact ? 1 : 1.5} sx={{ width: '100%' }}>
      <Stack
        direction={compact ? 'row' : { xs: 'column', sm: 'row' }}
        spacing={compact ? 1 : 1.5}
        sx={{ alignItems: compact ? 'center' : { sm: 'center' } }}
      >
        <TextField
          select
          label={compact ? undefined : 'Engineer'}
          size={size}
          value={chosenId}
          onChange={(event) => {
            setEngineerId(event.target.value)
            setError('')
          }}
          disabled={sending || !engineers.data}
          helperText={!engineers.data ? 'Loading engineers…' : undefined}
          slotProps={compact ? { htmlInput: { 'aria-label': 'Assign to' } } : undefined}
          sx={{ flexGrow: 1, minWidth: compact ? 0 : 200, ...(compact && compactSx) }}
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
          variant="contained"
          size={size}
          disabled={!chosenId || sending}
          startIcon={sending ? <CircularProgress size={16} color="inherit" /> : null}
          sx={compact ? { height: compactHeight, px: { xs: 2.25, sm: 1.5 }, flex: 'none', alignSelf: 'flex-start' } : undefined}
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
