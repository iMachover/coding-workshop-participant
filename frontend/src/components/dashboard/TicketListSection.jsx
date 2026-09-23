import PropTypes from 'prop-types'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import LinearProgress from '@mui/material/LinearProgress'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'

import ErrorState from '../ErrorState'

/**
 * A filtered ticket list's loading, error and no-match states. `children` is the list
 * itself, shown once there are results; it stays visible (with a progress bar) while
 * new filters load.
 */
function TicketListSection({ list, filtersActive, onClearFilters, children }) {
  if (list.error) return <ErrorState message={list.error.message} onRetry={list.reload} />
  if (list.loading && list.tickets.length === 0) {
    return <Skeleton variant="rounded" height={160} aria-label="Loading tickets" />
  }
  if (list.tickets.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography gutterBottom>No tickets match these filters.</Typography>
          {filtersActive && (
            <Button onClick={onClearFilters} size="small">
              Clear filters
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }
  return (
    <Box aria-busy={list.loading}>
      {list.loading && <LinearProgress sx={{ mb: 1 }} aria-label="Updating tickets" />}
      {children}
    </Box>
  )
}

TicketListSection.propTypes = {
  list: PropTypes.shape({
    tickets: PropTypes.array.isRequired,
    loading: PropTypes.bool.isRequired,
    error: PropTypes.instanceOf(Error),
    reload: PropTypes.func.isRequired,
  }).isRequired,
  filtersActive: PropTypes.bool.isRequired,
  onClearFilters: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
}

export default TicketListSection
