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

import { addFacility, updateFacility } from '../../services/adminFacilityService'
import { ApiError } from '../../services/apiClient'
import { FACILITY_KINDS, facilityName, facilityValue, parseFacilityValue } from '../../utils/facilities'

/** The dialog's title and button for adding or renaming. */
function copyFor({ type, kind, item, parent, parentKind }) {
  const { noun } = FACILITY_KINDS[kind]
  if (type === 'add') {
    const where = parent ? ` to ${facilityName(parentKind, parent)}` : ''
    return { title: `Add a ${noun}${where}`, confirm: `Add ${noun}` }
  }
  const verb = kind === 'building' ? 'Rename' : 'Renumber'
  return { title: `${verb} ${facilityName(kind, item)}`, confirm: 'Save' }
}

/**
 * Add a building, floor or seat, or rename (renumber) one. Checks the value the way the
 * API does before sending, and shows the API's refusal (e.g. a name already used) on
 * the field so it can be fixed in place. Render it with a `key` per action.
 */
function FacilityNameDialog({ action, onClose, onSaved }) {
  const { type, kind, item, parent } = action
  const { field, label, hint } = FACILITY_KINDS[kind]
  const [text, setText] = useState(type === 'rename' ? facilityValue(kind, item) : '')
  const [problem, setProblem] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const copy = copyFor(action)

  const handleSubmit = async (event) => {
    event.preventDefault()
    const { value, problem: issue } = parseFacilityValue(kind, text)
    setProblem(issue)
    setError('')
    if (issue) return
    // Nothing changed: no need to ask the API.
    if (type === 'rename' && String(value) === facilityValue(kind, item)) {
      onClose()
      return
    }

    setSending(true)
    try {
      const saved =
        type === 'add'
          ? await addFacility(kind, parent?.[FACILITY_KINDS[action.parentKind].idKey] ?? null, value)
          : await updateFacility(kind, item[FACILITY_KINDS[kind].idKey], { [field]: value })
      onSaved(saved)
    } catch (err) {
      if (err instanceof ApiError && (err.status === 409 || err.fieldErrors[field])) {
        setProblem(err.fieldErrors[field] ?? err.message)
      } else {
        setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      }
      setSending(false)
    }
  }

  return (
    <Dialog open onClose={sending ? undefined : onClose} aria-labelledby="facility-name-title" fullWidth maxWidth="xs">
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle id="facility-name-title">{copy.title}</DialogTitle>
        <DialogContent>
          <TextField
            label={label}
            required
            fullWidth
            autoFocus
            value={text}
            onChange={(event) => {
              setText(event.target.value)
              setProblem('')
            }}
            error={Boolean(problem)}
            helperText={problem || hint}
            disabled={sending}
            slotProps={{ htmlInput: kind === 'floor' ? { inputMode: 'numeric' } : {} }}
            sx={{ mt: 1 }}
          />
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={sending}
            startIcon={sending ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {sending ? 'Saving…' : copy.confirm}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

FacilityNameDialog.propTypes = {
  action: PropTypes.shape({
    type: PropTypes.oneOf(['add', 'rename']).isRequired,
    kind: PropTypes.oneOf(Object.keys(FACILITY_KINDS)).isRequired,
    // What's being renamed.
    item: PropTypes.object,
    // Where a new floor or seat goes, and what kind of thing that is.
    parent: PropTypes.object,
    parentKind: PropTypes.oneOf(['building', 'floor']),
  }).isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
}

export default FacilityNameDialog
