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

import { deleteFacility, updateFacility } from '../../services/adminFacilityService'
import { ApiError } from '../../services/apiClient'
import { FACILITY_KINDS, activeTicketsText, facilityName } from '../../utils/facilities'

// What's hidden along with it when it's deactivated.
const CHILDREN = { building: ', or any floor or seat in it,', floor: ', or any seat on it,', seat: '' }

/** Title, explanation and button for each action. */
function copyFor({ type, kind, item }) {
  const name = facilityName(kind, item)
  if (type === 'deactivate') {
    const count = item.active_ticket_count
    let tickets = ''
    if (count === 1) tickets = ' Its active ticket keeps this location.'
    else if (count > 1) tickets = ` Its ${activeTicketsText(count)} keep this location.`
    return {
      title: `Deactivate ${name}?`,
      body: `Employees won't be able to pick it${CHILDREN[kind]} for new tickets.${tickets} You can reactivate it later.`,
      confirm: 'Deactivate',
    }
  }
  if (type === 'reactivate') {
    return { title: `Reactivate ${name}?`, body: 'Employees can pick it for new tickets again.', confirm: 'Reactivate' }
  }
  return {
    title: `Delete ${name}?`,
    body: "This can't be undone. Only a location no ticket has used, with nothing under it, can be deleted.",
    confirm: 'Delete',
  }
}

/**
 * Confirms deactivating, reactivating or deleting a building, floor or seat. When a
 * delete is refused because tickets use it (409), offers to deactivate it instead.
 * Render it with a `key` per action.
 */
function FacilityConfirmDialog({ action, onClose, onDone, onDeactivateInstead }) {
  const { type, kind, item } = action
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const copy = copyFor(action)

  const handleConfirm = async () => {
    setSending(true)
    setError(null)
    const id = item[FACILITY_KINDS[kind].idKey]
    try {
      if (type === 'delete') {
        await deleteFacility(kind, id)
        onDone(null)
      } else {
        onDone(await updateFacility(kind, id, { is_active: type === 'reactivate' }))
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? { message: err.message, canDeactivate: type === 'delete' && err.status === 409 && item.is_active }
          : { message: 'Something went wrong. Please try again.', canDeactivate: false },
      )
      setSending(false)
    }
  }

  return (
    <Dialog open onClose={sending ? undefined : onClose} aria-labelledby="facility-confirm-title" maxWidth="xs">
      <DialogTitle id="facility-confirm-title">{copy.title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{copy.body}</DialogContentText>
        {error && (
          <Alert
            severity="error"
            sx={{ mt: 2 }}
            action={
              error.canDeactivate ? (
                <Button color="inherit" size="small" onClick={onDeactivateInstead}>
                  Deactivate instead
                </Button>
              ) : null
            }
          >
            {error.message}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={sending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color={type === 'delete' ? 'error' : 'primary'}
          onClick={handleConfirm}
          disabled={sending}
          startIcon={sending ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {sending ? 'Saving…' : copy.confirm}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

FacilityConfirmDialog.propTypes = {
  action: PropTypes.shape({
    type: PropTypes.oneOf(['deactivate', 'reactivate', 'delete']).isRequired,
    kind: PropTypes.oneOf(Object.keys(FACILITY_KINDS)).isRequired,
    item: PropTypes.shape({
      is_active: PropTypes.bool.isRequired,
      active_ticket_count: PropTypes.number.isRequired,
    }).isRequired,
  }).isRequired,
  onClose: PropTypes.func.isRequired,
  // Called with the updated item, or null after a delete.
  onDone: PropTypes.func.isRequired,
  onDeactivateInstead: PropTypes.func.isRequired,
}

export default FacilityConfirmDialog
