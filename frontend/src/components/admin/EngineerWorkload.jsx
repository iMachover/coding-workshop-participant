import PropTypes from 'prop-types'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Grid from '@mui/material/Grid'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import ErrorState from '../ErrorState'

/** One engineer's load. The card is a toggle: pressed while All tickets is showing only theirs. */
function WorkloadCard({ engineer, selected, onSelect }) {
  const { full_name: name, active_count: active, open_count: open, in_progress_count: inProgress } = engineer
  return (
    <Card variant="outlined" sx={{ height: '100%', borderColor: selected ? 'primary.main' : undefined, borderWidth: selected ? 2 : 1 }}>
      <CardActionArea
        aria-pressed={selected}
        aria-label={`${name}: ${active} active. ${selected ? 'Showing' : 'Show'} their tickets`}
        onClick={() => onSelect(engineer.user_id)}
        sx={{ height: '100%' }}
      >
        <CardContent>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography fontWeight={600}>{name}</Typography>
            {engineer.p1_count > 0 && <Chip label={`${engineer.p1_count} P1`} color="error" size="small" />}
          </Stack>
          <Typography variant="h5" component="p">
            {active} <Typography component="span" color="text.secondary">active</Typography>
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {open} open · {inProgress} in progress · {engineer.blocked_count} blocked
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  )
}

const engineerShape = PropTypes.shape({
  user_id: PropTypes.number.isRequired,
  full_name: PropTypes.string.isRequired,
  active_count: PropTypes.number.isRequired,
  open_count: PropTypes.number.isRequired,
  in_progress_count: PropTypes.number.isRequired,
  blocked_count: PropTypes.number.isRequired,
  p1_count: PropTypes.number.isRequired,
})

WorkloadCard.propTypes = {
  engineer: engineerShape.isRequired,
  selected: PropTypes.bool.isRequired,
  onSelect: PropTypes.func.isRequired,
}

/**
 * Every engineer's active tickets (open, in progress, blocked), lightest load first,
 * as the API sorts them. Choosing one filters All tickets to their tickets; choosing
 * them again clears it.
 */
function EngineerWorkload({ engineers, selectedId, onSelect }) {
  let content
  if (engineers.error) {
    content = <ErrorState message={engineers.error.message} onRetry={engineers.reload} />
  } else if (!engineers.data) {
    content = <Skeleton variant="rounded" height={110} aria-label="Loading engineers" />
  } else if (engineers.data.length === 0) {
    content = <Typography color="text.secondary">No engineers yet. Give someone the engineer role to start assigning.</Typography>
  } else {
    content = (
      <Grid container spacing={2} component="ul" aria-label="Engineers" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {engineers.data.map((e) => (
          <Grid key={e.user_id} component="li" size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
            <WorkloadCard engineer={e} selected={e.user_id === selectedId} onSelect={onSelect} />
          </Grid>
        ))}
      </Grid>
    )
  }

  return (
    <Box component="section" aria-labelledby="workload-title">
      <Typography id="workload-title" component="h2" variant="h5">
        Engineer workload
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Choose an engineer to see their tickets below.
      </Typography>
      {content}
    </Box>
  )
}

EngineerWorkload.propTypes = {
  engineers: PropTypes.shape({
    data: PropTypes.arrayOf(engineerShape),
    error: PropTypes.instanceOf(Error),
    reload: PropTypes.func.isRequired,
  }).isRequired,
  selectedId: PropTypes.number,
  onSelect: PropTypes.func.isRequired,
}

export default EngineerWorkload
