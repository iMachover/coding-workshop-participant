import { useState } from 'react'
import PropTypes from 'prop-types'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'

const REASON_LIMIT = 500

/** Why a reason can't be sent yet, or '' if it's fine. */
function reasonProblem(reason, required) {
  if (required && !reason.trim()) return 'Write a reason first.'
  if (reason.trim().length > REASON_LIMIT) return `Use ${REASON_LIMIT} characters or fewer.`
  return ''
}

/**
 * Asks for the reason behind a status change (why it's blocked, what was done, what's
 * still wrong) before making it. With `required` false the text is an optional note.
 * `error` is the API's refusal, shown in the dialog so the text isn't lost.
 */
function ReasonDialog({ title, label, hint, required = true, sending, error = '', onCancel, onConfirm }) {
  const [reason, setReason] = useState('')
  const [problem, setProblem] = useState('')

  const handleSubmit = (event) => {
    event.preventDefault()
    const issue = reasonProblem(reason, required)
    setProblem(issue)
    if (!issue) onConfirm(reason.trim())
  }

  return (
    <Dialog open onClose={sending ? undefined : onCancel} aria-labelledby="reason-title" fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle id="reason-title">{title}</DialogTitle>
        <DialogContent>
          <TextField
            label={label}
            required={required}
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
            helperText={problem || `${hint} ${reason.trim().length}/${REASON_LIMIT}`}
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
            {sending ? 'Saving…' : title}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

ReasonDialog.propTypes = {
  title: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  hint: PropTypes.string.isRequired,
  required: PropTypes.bool,
  sending: PropTypes.bool.isRequired,
  error: PropTypes.string,
  onCancel: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
}

export default ReasonDialog
