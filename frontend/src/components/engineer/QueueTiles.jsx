import PropTypes from 'prop-types'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'

const TILES = [
  ['open', 'Open'],
  ['inProgress', 'In Progress'],
  ['blocked', 'Blocked'],
  ['p1', 'P1 to finish'],
]

/** Headline counts of the engineer's active queue (see countQueue): one tile each. */
function QueueTiles({ counts }) {
  return (
    <Grid container spacing={2} component="ul" aria-label="My queue in numbers" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {TILES.map(([key, label]) => (
        <Grid key={key} component="li" size={{ xs: 6, md: 3 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">
                {label}
              </Typography>
              <Typography sx={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1, color: 'secondary.main' }}>
                {counts[key]}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  )
}

QueueTiles.propTypes = {
  counts: PropTypes.shape({
    open: PropTypes.number.isRequired,
    inProgress: PropTypes.number.isRequired,
    blocked: PropTypes.number.isRequired,
    p1: PropTypes.number.isRequired,
  }).isRequired,
}

export default QueueTiles
