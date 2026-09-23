import PropTypes from 'prop-types'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'

import { STATUSES, URGENCIES } from '../../utils/ticketFormat'
import StatusLabel from '../tickets/StatusLabel'
import UrgencyLabel from '../tickets/UrgencyLabel'

function Tile({ label, children }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography component="h3" variant="subtitle2" color="text.secondary" gutterBottom>
          {label}
        </Typography>
        {children}
      </CardContent>
    </Card>
  )
}

Tile.propTypes = {
  label: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
}

function CountList({ entries, renderLabel }) {
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {entries.map(([key, count]) => (
        <Box
          component="li"
          key={key}
          sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25 }}
        >
          {renderLabel(key)}
          <Typography component="span" fontWeight={600}>
            {count}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}

CountList.propTypes = {
  entries: PropTypes.arrayOf(PropTypes.array).isRequired,
  renderLabel: PropTypes.func.isRequired,
}

/**
 * Headline numbers: active tickets, all tickets by status, active tickets by urgency.
 */
function StatTiles({ activeCount, byStatus, activeByUrgency }) {
  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, sm: 4 }}>
        <Tile label="Active tickets">
          <Typography sx={{ fontSize: 48, fontWeight: 600, lineHeight: 1.1, color: 'secondary.main' }}>
            {activeCount}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Not yet closed
          </Typography>
        </Tile>
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <Tile label="By status">
          <CountList
            entries={Object.keys(STATUSES).map((s) => [s, byStatus[s]])}
            renderLabel={(s) => <StatusLabel status={s} />}
          />
        </Tile>
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <Tile label="Active by urgency">
          <CountList
            entries={Object.keys(URGENCIES).map((u) => [u, activeByUrgency[u]])}
            renderLabel={(u) => <UrgencyLabel urgency={u} />}
          />
        </Tile>
      </Grid>
    </Grid>
  )
}

StatTiles.propTypes = {
  activeCount: PropTypes.number.isRequired,
  byStatus: PropTypes.objectOf(PropTypes.number).isRequired,
  activeByUrgency: PropTypes.objectOf(PropTypes.number).isRequired,
}

export default StatTiles
