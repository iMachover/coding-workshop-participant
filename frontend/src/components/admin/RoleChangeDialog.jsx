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
import Link from '@mui/material/Link'
import { Link as RouterLink } from 'react-router'

import { changeRole } from '../../services/adminUserService'
import { ApiError } from '../../services/apiClient'

const COPY = {
  engineer: {
    title: (name) => `Make ${name} an engineer?`,
    body: 'They can then be assigned tickets.',
    confirm: 'Make engineer',
  },
  employee: {
    title: (name) => `Move ${name} back to employee?`,
    body: "They won't be able to take tickets any more.",
    confirm: 'Make employee',
  },
}

/**
 * Confirms a role change, since it signs the person out. When an engineer can't be moved
 * back because they still have tickets, links to those tickets on the dashboard.
 * Render it with a `key` per change, so each one starts without a leftover error.
 */
function RoleChangeDialog({ change, onClose, onChanged }) {
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const copy = change && COPY[change.role]

  const handleConfirm = async () => {
    setSending(true)
    setError(null)
    try {
      onChanged(await changeRole(change.user.user_id, change.role))
    } catch (err) {
      setError(
        err instanceof ApiError
          ? { message: err.message, hasTickets: err.status === 409 && change.role === 'employee' }
          : { message: 'Something went wrong. Please try again.', hasTickets: false },
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={Boolean(change)} onClose={sending ? undefined : onClose} aria-labelledby="role-change-title">
      {change && (
        <>
          <DialogTitle id="role-change-title">{copy.title(change.user.full_name)}</DialogTitle>
          <DialogContent>
            <DialogContentText>
              {copy.body} They&apos;ll be signed out and need to sign in again.
            </DialogContentText>
            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error.message}{' '}
                {error.hasTickets && (
                  <Link component={RouterLink} to={`/admin?engineer=${change.user.user_id}`}>
                    See their tickets
                  </Link>
                )}
              </Alert>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose} disabled={sending}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleConfirm}
              disabled={sending}
              startIcon={sending ? <CircularProgress size={16} color="inherit" /> : null}
            >
              {sending ? 'Saving…' : copy.confirm}
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  )
}

RoleChangeDialog.propTypes = {
  change: PropTypes.shape({
    user: PropTypes.shape({
      user_id: PropTypes.number.isRequired,
      full_name: PropTypes.string.isRequired,
    }).isRequired,
    role: PropTypes.oneOf(Object.keys(COPY)).isRequired,
  }),
  onClose: PropTypes.func.isRequired,
  onChanged: PropTypes.func.isRequired,
}

export default RoleChangeDialog
