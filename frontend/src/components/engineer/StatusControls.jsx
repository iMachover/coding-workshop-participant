import { useState } from 'react'
import PropTypes from 'prop-types'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { ApiError } from '../../services/apiClient'
import { changeTicketStatus } from '../../services/engineerTicketService'
import { STATUSES } from '../../utils/ticketFormat'
import { engineerMoves } from '../../utils/ticketWorkflow'
import ReasonDialog from '../tickets/ReasonDialog'

const errorMessage = (err) => (err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')

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
          title={asking.reason.title}
          label={asking.reason.label}
          hint={asking.reason.hint}
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
