import PropTypes from 'prop-types'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import Grid from '@mui/material/Grid'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'

import { METRIC_CARDS } from '../../utils/adminMetrics'
import ErrorState from '../ErrorState'

/**
 * The dashboard's headline counts as a row of cards. Each card is a toggle: choosing it
 * shows exactly those tickets in All tickets (see METRIC_CARDS); choosing it again clears it.
 */
function MetricCards({ metrics, selected, onSelect }) {
  if (metrics.error) return <ErrorState message={metrics.error.message} onRetry={metrics.reload} />
  if (!metrics.data) return <Skeleton variant="rounded" height={96} aria-label="Loading the numbers" />

  return (
    <Grid container spacing={2} component="ul" aria-label="Tickets in numbers" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {METRIC_CARDS.map(({ key, label }) => {
        const count = metrics.data[key]
        const pressed = selected === key
        return (
          <Grid key={key} component="li" size={{ xs: 6, sm: 4, md: 3 }}>
            <Card
              variant="outlined"
              sx={{ height: '100%', borderColor: pressed ? 'primary.main' : undefined, borderWidth: pressed ? 2 : 1 }}
            >
              <CardActionArea
                aria-pressed={pressed}
                aria-label={`${label}: ${count}. ${pressed ? 'Showing' : 'Show'} these tickets`}
                onClick={() => onSelect(key)}
                sx={{ height: '100%' }}
              >
                <CardContent>
                  <Typography variant="subtitle2" color="text.secondary">
                    {label}
                  </Typography>
                  <Typography sx={{ fontSize: 36, fontWeight: 600, lineHeight: 1.1, color: 'secondary.main' }}>
                    {count}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        )
      })}
    </Grid>
  )
}

MetricCards.propTypes = {
  metrics: PropTypes.shape({
    data: PropTypes.objectOf(PropTypes.number),
    error: PropTypes.instanceOf(Error),
    reload: PropTypes.func.isRequired,
  }).isRequired,
  selected: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
}

export default MetricCards
