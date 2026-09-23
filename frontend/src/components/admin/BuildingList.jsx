import PropTypes from 'prop-types'
import Card from '@mui/material/Card'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'

import { activeTicketsText } from '../../utils/facilities'

const buildingShape = PropTypes.shape({
  building_id: PropTypes.number.isRequired,
  building_name: PropTypes.string.isRequired,
  is_active: PropTypes.bool.isRequired,
  active_ticket_count: PropTypes.number.isRequired,
  floors: PropTypes.array.isRequired,
})

/** "3 floors · 2 active tickets · Inactive" */
function summary(building) {
  const floors = `${building.floors.length} ${building.floors.length === 1 ? 'floor' : 'floors'}`
  const parts = [floors, activeTicketsText(building.active_ticket_count)]
  if (!building.is_active) parts.push('Inactive')
  return parts.join(' · ')
}

/**
 * Every building, to choose which one to manage. A list beside the details on larger
 * screens; a dropdown above them on phones (`compact`).
 */
function BuildingList({ buildings, selectedId, onSelect, compact = false }) {
  if (compact) {
    return (
      <TextField
        select
        label="Building"
        size="small"
        fullWidth
        value={String(selectedId)}
        onChange={(event) => onSelect(Number(event.target.value))}
      >
        {buildings.map((b) => (
          <MenuItem key={b.building_id} value={String(b.building_id)}>
            {b.is_active ? b.building_name : `${b.building_name} (inactive)`}
          </MenuItem>
        ))}
      </TextField>
    )
  }

  return (
    <Card>
      <List aria-label="Buildings" disablePadding>
        {buildings.map((b) => (
          <ListItemButton
            key={b.building_id}
            selected={b.building_id === selectedId}
            aria-current={b.building_id === selectedId ? 'true' : undefined}
            onClick={() => onSelect(b.building_id)}
          >
            <ListItemText
              primary={b.building_name}
              secondary={summary(b)}
              slotProps={{
                primary: { sx: { fontWeight: 600, overflowWrap: 'anywhere', color: b.is_active ? undefined : 'text.secondary' } },
              }}
            />
          </ListItemButton>
        ))}
      </List>
    </Card>
  )
}

BuildingList.propTypes = {
  buildings: PropTypes.arrayOf(buildingShape).isRequired,
  selectedId: PropTypes.number.isRequired,
  onSelect: PropTypes.func.isRequired,
  compact: PropTypes.bool,
}

export default BuildingList
