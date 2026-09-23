import { useState } from 'react'
import PropTypes from 'prop-types'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import { ApiError } from '../../services/apiClient'
import { changeTicketStatus } from '../../services/engineerTicketService'
import { STATUSES } from '../../utils/ticketFormat'
import { engineerMoves } from '../../utils/ticketWorkflow'

const REASON_LIMIT = 500

/** Why a reason can't be sent yet, or '' if it's fine. */
function reasonProblem(reason) {
  if (!reason.trim()) return 'Write a reason first.'
  if (reason.trim().length > REASON_LIMIT) return `Use ${REASON_LIMIT} characters or fewer.`
  return ''
}

const errorMessage = (err) => (err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')

/** Asks why the ticket is blocked, or what was done to resolve it, then makes the move. */
function ReasonDialog({ move, sending, error, onCancel, onConfirm }) {
  const [reason, setReason] = useState('')
  const [problem, setProblem] = useState('')

  const handleSubmit = (event) => {
    event.preventDefault()
    const issue = reasonProblem(reason)
    setProblem(issue)
    if (!issue) onConfirm(reason.trim())
  }

  return (
    <Dialog open onClose={sending ? undefined : onCancel} aria-labelledby="reason-title" fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle id="reason-title">{move.reason.title}</DialogTitle>
        <DialogContent>
          <TextField
            label={move.reason.label}
            required
            multiline
            minRows={3}
            fullWidth
            autoFocus
            value={reason}
            onChange={(event) => {
              setReason(event.target.value)
              setProblem('')
            }}
            error={Boolean(problem)}
            helperText={problem || `${move.reason.hint} ${reason.trim().length}/${REASON_LIMIT}`}
            disabled={sending}
            sx={{ mt: 1 }}
          />
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onCancel} disabled={sending}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={sending}
            startIcon={sending ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {sending ? 'Saving…' : move.reason.title}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

const moveShape = PropTypes.shape({
  to: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  reason: PropTypes.shape({
    title: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    hint: PropTypes.string.isRequired,
  }),
})

ReasonDialog.propTypes = {
  move: moveShape.isRequired,
  sending: PropTypes.bool.isRequired,
  error: PropTypes.string,
  onCancel: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
}

/**
 * The engineer's buttons for moving a ticket on: only the moves the workflow allows from
 * its current status (see engineerMoves). Blocking and resolving ask for a reason first.
 * `onChanged(ticket)` gets the updated ticket.
 */
function StatusControls({ ticketId, status, onChanged }) {
  const [asking, setAsking] = useState(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const moves = engineerMoves(status)

  const makeMove = async (move, reason) => {
    setSending(true)
    setError('')
    try {
      const updated = await changeTicketStatus(ticketId, move.to, reason)
      setAsking(null)
      setNotice(`Status changed to ${STATUSES[updated.status].label}.`)
      onChanged(updated)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSending(false)
    }
  }

  if (moves.length === 0) {
    return <Typography color="text.secondary">This ticket is closed, so its status can&apos;t change.</Typography>
  }

  return (
    <Stack spacing={2}>
      {status === 'resolved' && (
        <Typography color="text.secondary">Waiting for an admin to close it. Reopen it if the problem is back.</Typography>
      )}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        {moves.map((move, index) => (
          <Button
            key={move.to}
            variant={index === 0 ? 'contained' : 'outlined'}
            disabled={sending}
            onClick={() => {
              setNotice('')
              setError('')
              if (move.reason) setAsking(move)
              else makeMove(move)
            }}
          >
            {move.label}
          </Button>
        ))}
      </Stack>
      {notice && (
        <Alert severity="success" onClose={() => setNotice('')}>
          {notice}
        </Alert>
      )}
      {error && !asking && <Alert severity="error">{error}</Alert>}
      {asking && (
        <ReasonDialog
          move={asking}
          sending={sending}
          error={error}
          onCancel={() => {
            setAsking(null)
            setError('')
          }}
          onConfirm={(reason) => makeMove(asking, reason)}
        />
      )}
    </Stack>
  )
}

StatusControls.propTypes = {
  ticketId: PropTypes.number.isRequired,
  status: PropTypes.oneOf(Object.keys(STATUSES)).isRequired,
  onChanged: PropTypes.func.isRequired,
}

export default StatusControls
