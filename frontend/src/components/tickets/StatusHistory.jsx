import PropTypes from 'prop-types'
import Box from '@mui/material/Box'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import useAuth from '../../auth/useAuth'
import { formatDateTime, ROLES, STATUSES } from '../../utils/ticketFormat'
import { describeStatusChange } from '../../utils/ticketWorkflow'
import ErrorState from '../ErrorState'
import LabelWithDot from './LabelWithDot'

/**
 * Every status the ticket has been in, oldest first: who moved it, when, and why
 * (when a reason was given). A reopened ticket stands out, but the word "Reopened"
 * carries that, not just the border color.
 */
function StatusHistory({ history }) {
  const { user } = useAuth()

  if (history.error) return <ErrorState message={history.error.message} onRetry={history.reload} />
  if (history.loading && !history.data) {
    return <Skeleton variant="rounded" height={80} aria-label="Loading status history" />
  }
  if (history.data.length === 0) {
    return <Typography color="text.secondary">No status changes yet.</Typography>
  }

  return (
    <Stack component="ol" aria-label="Status history" spacing={2} sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {history.data.map((change) => {
        const { label, kind } = describeStatusChange(change)
        return (
          <Box
            component="li"
            key={change.history_id}
            sx={{ pl: 2, borderLeft: 3, borderColor: kind === 'reopened' ? 'warning.main' : 'divider' }}
          >
            <Typography fontWeight={600}>
              <LabelWithDot label={label} dot={STATUSES[change.to_status].dot} />
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {change.changed_by_user_id === user.user_id ? 'You' : change.changed_by_name}
              {' · '}
              {ROLES[change.changed_by_role]} · {formatDateTime(change.changed_at)}
            </Typography>
            {change.reason && <Typography sx={{ whiteSpace: 'pre-wrap', mt: 0.5 }}>{change.reason}</Typography>}
          </Box>
        )
      })}
    </Stack>
  )
}

StatusHistory.propTypes = {
  history: PropTypes.shape({
    data: PropTypes.arrayOf(
      PropTypes.shape({
        history_id: PropTypes.number.isRequired,
        from_status: PropTypes.oneOf([...Object.keys(STATUSES), null]),
        to_status: PropTypes.oneOf(Object.keys(STATUSES)).isRequired,
        changed_by_user_id: PropTypes.number.isRequired,
        changed_by_name: PropTypes.string.isRequired,
        changed_by_role: PropTypes.oneOf(Object.keys(ROLES)).isRequired,
        reason: PropTypes.string,
        changed_at: PropTypes.string.isRequired,
      }),
    ),
    loading: PropTypes.bool.isRequired,
    error: PropTypes.instanceOf(Error),
    reload: PropTypes.func.isRequired,
  }).isRequired,
}

export default StatusHistory
