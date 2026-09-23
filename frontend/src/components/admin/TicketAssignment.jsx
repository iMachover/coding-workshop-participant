import { useState } from 'react'
import PropTypes from 'prop-types'
import Alert from '@mui/material/Alert'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { formatDateTime, STATUSES } from '../../utils/ticketFormat'
import AssignEngineerForm from './AssignEngineerForm'

// Finished tickets keep the engineer who did the work; the API answers 409 for these.
const FINISHED = ['resolved', 'closed']

/**
 * Who owns the ticket and since when, with a form to assign or reassign it while it's
 * unfinished. Confirms a change until the next one.
 */
function TicketAssignment({ ticket, engineers, onAssigned }) {
  const [notice, setNotice] = useState('')
  const finished = FINISHED.includes(ticket.status)

  const handleAssigned = (updated) => {
    setNotice(`Assigned to ${updated.assigned_to_name}.`)
    onAssigned(updated)
  }

  return (
    <Stack spacing={2}>
      {ticket.assigned_to_name ? (
        <div>
          <Typography fontWeight={600}>{ticket.assigned_to_name}</Typography>
          {ticket.assigned_at && (
            <Typography variant="body2" color="text.secondary">
              Assigned {formatDateTime(ticket.assigned_at)}
            </Typography>
          )}
        </div>
      ) : (
        <Typography color="text.secondary">No engineer yet.</Typography>
      )}
      {notice && (
        <Alert severity="success" onClose={() => setNotice('')}>
          {notice}
        </Alert>
      )}
      {finished ? (
        <Typography color="text.secondary">
          {STATUSES[ticket.status].label} tickets keep their engineer and can&apos;t be reassigned.
        </Typography>
      ) : (
        <AssignEngineerForm
          ticketId={ticket.ticket_id}
          currentEngineerId={ticket.assigned_to_user_id}
          engineers={engineers}
          onAssigned={handleAssigned}
        />
      )}
    </Stack>
  )
}

TicketAssignment.propTypes = {
  ticket: PropTypes.shape({
    ticket_id: PropTypes.number.isRequired,
    status: PropTypes.oneOf(Object.keys(STATUSES)).isRequired,
    assigned_to_user_id: PropTypes.number,
    assigned_to_name: PropTypes.string,
    assigned_at: PropTypes.string,
  }).isRequired,
  engineers: PropTypes.shape({
    data: PropTypes.array,
    error: PropTypes.instanceOf(Error),
    reload: PropTypes.func.isRequired,
  }).isRequired,
  onAssigned: PropTypes.func.isRequired,
}

export default TicketAssignment
