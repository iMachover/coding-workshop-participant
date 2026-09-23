import { useState } from 'react'
import PropTypes from 'prop-types'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'

import { ApiError } from '../../services/apiClient'
import { addNote } from '../../services/ticketService'
import NoteList from './NoteList'

const NOTE_LIMIT = 2000

function noteError(text) {
  if (!text.trim()) return 'Write a note first.'
  if (text.trim().length > NOTE_LIMIT) return `Use ${NOTE_LIMIT} characters or fewer.`
  return ''
}

/** "Add a note" box. Hidden for closed tickets, since the API rejects those notes. */
function AddNoteForm({ ticketId, onAdded }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    const problem = noteError(text)
    setError(problem)
    if (problem) return

    setSending(true)
    try {
      await addNote(ticketId, text)
      setText('')
      onAdded()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Stack spacing={1.5}>
        <TextField
          id="note-text"
          label="Add a note"
          placeholder="Add details, answer a question or tell the engineer what changed."
          multiline
          minRows={3}
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            if (error) setError('')
          }}
          error={Boolean(error)}
          helperText={error || `${text.trim().length}/${NOTE_LIMIT}`}
          disabled={sending}
          fullWidth
        />
        <Box>
          <Button
            type="submit"
            variant="contained"
            disabled={sending}
            startIcon={sending ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {sending ? 'Adding note…' : 'Add note'}
          </Button>
        </Box>
      </Stack>
    </form>
  )
}

AddNoteForm.propTypes = {
  ticketId: PropTypes.number.isRequired,
  onAdded: PropTypes.func.isRequired,
}

/**
 * The ticket's conversation: notes from the employee and engineers, oldest first,
 * with a box to add one while the ticket is still open.
 */
function TicketNotes({ ticketId, closed, notes, onAdded }) {
  return (
    <Stack spacing={3}>
      <NoteList notes={notes} />
      {closed ? (
        <Alert severity="info">This ticket is closed, so new notes can&apos;t be added.</Alert>
      ) : (
        <AddNoteForm ticketId={ticketId} onAdded={onAdded} />
      )}
    </Stack>
  )
}

TicketNotes.propTypes = {
  ticketId: PropTypes.number.isRequired,
  closed: PropTypes.bool.isRequired,
  notes: NoteList.propTypes.notes,
  onAdded: PropTypes.func.isRequired,
}

export default TicketNotes
