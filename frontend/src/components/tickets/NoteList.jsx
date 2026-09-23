import PropTypes from 'prop-types'
import Box from '@mui/material/Box'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import useAuth from '../../auth/useAuth'
import { formatDateTime, ROLES } from '../../utils/ticketFormat'
import ErrorState from '../ErrorState'

/**
 * A ticket's notes, oldest first, with each author's name and role ("You" for the
 * signed-in user). Staff notes get a colored edge. Read-only; see TicketNotes for adding.
 */
function NoteList({ notes }) {
  const { user } = useAuth()

  if (notes.error) return <ErrorState message={notes.error.message} onRetry={notes.reload} />
  if (notes.loading && !notes.data) {
    return <Skeleton variant="rounded" height={80} aria-label="Loading notes" />
  }
  if (notes.data.length === 0) return <Typography color="text.secondary">No notes yet.</Typography>

  return (
    <Stack component="ol" spacing={2} sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {notes.data.map((note) => (
        <Box
          component="li"
          key={note.note_id}
          sx={{ pl: 2, borderLeft: 3, borderColor: note.author_role === 'employee' ? 'divider' : 'primary.main' }}
        >
          <Typography variant="body2" color="text.secondary">
            <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>
              {note.user_id === user.user_id ? 'You' : note.author_name}
            </Box>
            {' · '}
            {ROLES[note.author_role]} · {formatDateTime(note.created_at)}
          </Typography>
          <Typography sx={{ whiteSpace: 'pre-wrap' }}>{note.note_text}</Typography>
        </Box>
      ))}
    </Stack>
  )
}

NoteList.propTypes = {
  notes: PropTypes.shape({
    data: PropTypes.arrayOf(
      PropTypes.shape({
        note_id: PropTypes.number.isRequired,
        user_id: PropTypes.number.isRequired,
        author_name: PropTypes.string.isRequired,
        author_role: PropTypes.oneOf(Object.keys(ROLES)).isRequired,
        note_text: PropTypes.string.isRequired,
        created_at: PropTypes.string.isRequired,
      }),
    ),
    loading: PropTypes.bool.isRequired,
    error: PropTypes.instanceOf(Error),
    reload: PropTypes.func.isRequired,
  }).isRequired,
}

export default NoteList
