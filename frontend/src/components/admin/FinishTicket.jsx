import { useState } from 'react'
import PropTypes from 'prop-types'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { finishTicket } from '../../services/adminTicketService'
import { ApiError } from '../../services/apiClient'
import { STATUSES } from '../../utils/ticketFormat'
import ReasonDialog from '../tickets/ReasonDialog'

// The two ways an admin finishes a resolved ticket. Closing takes an optional note;
// sending back needs to say what's still wrong.
const ACTIONS = {
  close: {
    to: 'closed',
    button: 'Close ticket…',
    title: 'Close ticket',
    label: 'Closing note',
    hint: 'Optional. The employee sees it in the ticket history.',
    required: false,
    done: () => 'Ticket closed.',
  },
  sendBack: {
    to: 'in_progress',
    button: 'Send back…',
    title: 'Send back to the engineer',
    label: "What's still wrong?",
    hint: 'The engineer and the employee see this in the ticket history.',
    required: true,
    done: (ticket) => `Sent back to ${ticket.assigned_to_name}.`,
  },
}

/**
 * The admin's last step: once the engineer resolves a ticket, close it or send it back
 * to them. Both ask for text first (a note, or what's still wrong). `onFinished(ticket)`
 * gets the updated ticket.
 */
function FinishTicket({ ticketId, status, onFinished }) {
  const [asking, setAsking] = useState(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const finish = async (action, reason) => {
    setSending(true)
    setError('')
    try {
      const ticket = await finishTicket(ticketId, action.to, reason)
      setAsking(null)
      setNotice(action.done(ticket))
      onFinished(ticket)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Stack spacing={2}>
      {status === 'resolved' ? (
        <>
          <Typography color="text.secondary">
            The engineer has resolved this. Close it, or send it back if the problem isn&apos;t fixed.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <Button variant="contained" onClick={() => setAsking(ACTIONS.close)}>
              {ACTIONS.close.button}
            </Button>
            <Button variant="outlined" onClick={() => setAsking(ACTIONS.sendBack)}>
              {ACTIONS.sendBack.button}
            </Button>
          </Stack>
        </>
      ) : (
        <Typography color="text.secondary">
          {status === 'closed'
            ? 'This ticket is closed.'
            : "The engineer hasn't resolved this yet. You can close it once they have."}
        </Typography>
      )}
      {notice && (
        <Alert severity="success" onClose={() => setNotice('')}>
          {notice}
        </Alert>
      )}
      {asking && (
        <ReasonDialog
          title={asking.title}
          label={asking.label}
          hint={asking.hint}
          required={asking.required}
          sending={sending}
          error={error}
          onCancel={() => {
            setAsking(null)
            setError('')
          }}
          onConfirm={(reason) => finish(asking, reason)}
        />
      )}
    </Stack>
  )
}

FinishTicket.propTypes = {
  ticketId: PropTypes.number.isRequired,
  status: PropTypes.oneOf(Object.keys(STATUSES)).isRequired,
  onFinished: PropTypes.func.isRequired,
}

export default FinishTicket
