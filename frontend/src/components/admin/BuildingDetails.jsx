import PropTypes from 'prop-types'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import { Link as RouterLink } from 'react-router'

import { activeTicketsText } from '../../utils/facilities'
import FacilityActions, { InactiveChip } from './FacilityActions'
import FloorAccordion from './FloorAccordion'

/**
 * One building: its name, whether it's active, its active tickets (a link to them on the
 * dashboard), its actions, then its floors, each with its seats.
 * `onAction(type, kind, item, parent)` opens the matching dialog.
 */
function BuildingDetails({ building, onAction }) {
  const tickets = activeTicketsText(building.active_ticket_count)

  return (
    <Card component="section" aria-labelledby="building-title">
      <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack spacing={2}>
          <Box>
            <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography id="building-title" variant="h5" component="h2" sx={{ overflowWrap: 'anywhere' }}>
                {building.building_name}
              </Typography>
              {!building.is_active && <InactiveChip />}
            </Stack>
            {building.active_ticket_count > 0 ? (
              <Link component={RouterLink} to={`/admin?building=${building.building_id}`}>
                {tickets}
              </Link>
            ) : (
              <Typography color="text.secondary">{tickets}</Typography>
            )}
            {!building.is_active && (
              <Typography variant="body2" color="text.secondary">
                Employees can&apos;t pick it, or any floor or seat in it, for new tickets.
              </Typography>
            )}
          </Box>

          <FacilityActions kind="building" item={building} onAction={(type) => onAction(type, 'building', building)} />

          <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6" component="h3">
              Floors
            </Typography>
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddIcon />}
              aria-label={`Add a floor to ${building.building_name}`}
              onClick={() => onAction('add', 'floor', null, building)}
            >
              Add floor
            </Button>
          </Stack>

          {building.floors.length === 0 ? (
            <Typography color="text.secondary">No floors yet.</Typography>
          ) : (
            <Box>
              {building.floors.map((floor) => (
                <FloorAccordion key={floor.floor_id} building={building} floor={floor} onAction={onAction} />
              ))}
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}

BuildingDetails.propTypes = {
  building: PropTypes.shape({
    building_id: PropTypes.number.isRequired,
    building_name: PropTypes.string.isRequired,
    is_active: PropTypes.bool.isRequired,
    active_ticket_count: PropTypes.number.isRequired,
    floors: PropTypes.arrayOf(PropTypes.shape({ floor_id: PropTypes.number.isRequired })).isRequired,
  }).isRequired,
  onAction: PropTypes.func.isRequired,
}

export default BuildingDetails
