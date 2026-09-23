import { useState } from 'react'
import PropTypes from 'prop-types'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import PriorityHighIcon from '@mui/icons-material/PriorityHigh'

import { ApiError } from '../../services/apiClient'
import { requestEscalation } from '../../services/ticketService'

const REASON_LIMIT = 1000

/**
 * Escalation: shows a request already made, or lets the employee make one with a
 * reason. A ticket can be escalated once, and not after it is closed.
 */
function EscalationPanel({ ticket, onEscalated }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  if (ticket.escalation_requested) {
    return (
      <Alert severity="warning" icon={<PriorityHighIcon />}>
        <strong>Escalation requested.</strong> A facility admin will review it.
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          Your reason: {ticket.escalation_reason}
        </Typography>
      </Alert>
    )
  }
  if (ticket.status === 'closed') {
    return <Typography color="text.secondary">Closed tickets can&apos;t be escalated.</Typography>
  }

  const close = () => {
    setOpen(false)
    setError('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!reason.trim()) return setError('Tell the facility admin why this needs more attention.')
    if (reason.trim().length > REASON_LIMIT) return setError(`Use ${REASON_LIMIT} characters or fewer.`)

    setSending(true)
    try {
      await requestEscalation(ticket.ticket_id, reason)
      setOpen(false)
      setReason('')
      onEscalated()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSending(false)
    }
    return undefined
  }

  return (
    <>
      <Typography color="text.secondary" sx={{ mb: 1.5 }}>
        Is this getting worse, or not being handled? Ask a facility admin to take a look.
      </Typography>
      <Button variant="outlined" startIcon={<PriorityHighIcon />} onClick={() => setOpen(true)}>
        Request escalation
      </Button>

      <Dialog open={open} onClose={sending ? undefined : close} fullWidth maxWidth="sm">
        <form onSubmit={handleSubmit} noValidate>
          <DialogTitle>Request escalation</DialogTitle>
          <DialogContent>
            <DialogContentText sx={{ mb: 2 }}>
              A facility admin will review ticket #{ticket.ticket_id} and follow up.
            </DialogContentText>
            <TextField
              id="escalation-reason"
              label="Why does this need more attention?"
              multiline
              minRows={3}
              required
              autoFocus
              value={reason}
              onChange={(event) => {
                setReason(event.target.value)
                if (error) setError('')
              }}
              error={Boolean(error)}
              helperText={error || `${reason.trim().length}/${REASON_LIMIT}`}
              disabled={sending}
              fullWidth
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={close} disabled={sending}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={sending}
              startIcon={sending ? <CircularProgress size={16} color="inherit" /> : null}
            >
              {sending ? 'Sending…' : 'Request escalation'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  )
}

EscalationPanel.propTypes = {
  ticket: PropTypes.shape({
    ticket_id: PropTypes.number.isRequired,
    status: PropTypes.string.isRequired,
    escalation_requested: PropTypes.bool.isRequired,
    escalation_reason: PropTypes.string,
  }).isRequired,
  onEscalated: PropTypes.func.isRequired,
}

export default EscalationPanel
