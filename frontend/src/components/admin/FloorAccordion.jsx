import { useState } from 'react'
import PropTypes from 'prop-types'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'

import { activeTicketsText, hiddenByParent } from '../../utils/facilities'
import FacilityActions, { InactiveChip } from './FacilityActions'

const seatShape = PropTypes.shape({
  seat_id: PropTypes.number.isRequired,
  seat_number: PropTypes.string.isRequired,
  is_active: PropTypes.bool.isRequired,
  active_ticket_count: PropTypes.number.isRequired,
})

const floorShape = PropTypes.shape({
  floor_id: PropTypes.number.isRequired,
  floor_number: PropTypes.number.isRequired,
  is_active: PropTypes.bool.isRequired,
  active_ticket_count: PropTypes.number.isRequired,
  seats: PropTypes.arrayOf(seatShape).isRequired,
})

/**
 * A floor's seats as chips. Choosing one opens its actions (renumber, deactivate or
 * reactivate, delete). Inactive seats are outlined and struck through.
 */
function SeatChips({ seats, onAction }) {
  const [menu, setMenu] = useState(null)
  const close = () => setMenu(null)
  const choose = (type) => {
    const { seat } = menu
    close()
    onAction(type, seat)
  }

  return (
    <>
      {seats.map((seat) => {
        const tickets = seat.active_ticket_count ? ` · ${seat.active_ticket_count}` : ''
        return (
          <Chip
            key={seat.seat_id}
            label={`${seat.seat_number}${tickets}`}
            variant={seat.is_active ? 'filled' : 'outlined'}
            onClick={(event) => setMenu({ anchor: event.currentTarget, seat })}
            aria-label={`Seat ${seat.seat_number}${seat.is_active ? '' : ', inactive'}${
              seat.active_ticket_count ? `, ${activeTicketsText(seat.active_ticket_count)}` : ''
            }`}
            aria-haspopup="menu"
            sx={seat.is_active ? undefined : { textDecoration: 'line-through', color: 'text.secondary' }}
          />
        )
      })}
      <Menu anchorEl={menu?.anchor} open={Boolean(menu)} onClose={close}>
        <MenuItem onClick={() => choose('rename')}>Renumber</MenuItem>
        {menu?.seat.is_active ? (
          <MenuItem onClick={() => choose('deactivate')}>Deactivate</MenuItem>
        ) : (
          <MenuItem onClick={() => choose('reactivate')}>Reactivate</MenuItem>
        )}
        <MenuItem onClick={() => choose('delete')} sx={{ color: 'error.main' }}>
          Delete
        </MenuItem>
      </Menu>
    </>
  )
}

SeatChips.propTypes = {
  seats: PropTypes.arrayOf(seatShape).isRequired,
  onAction: PropTypes.func.isRequired,
}

/**
 * One floor: its number, whether it's active, its seats and active tickets in the
 * summary; the floor's actions and its seats (with "Add seat") when expanded.
 * `onAction(type, kind, item, parent)` opens the matching dialog.
 */
function FloorAccordion({ building, floor, onAction }) {
  const hidden = floor.is_active ? hiddenByParent(building) : ''
  const seatCount = `${floor.seats.length} ${floor.seats.length === 1 ? 'seat' : 'seats'}`
  const tickets = activeTicketsText(floor.active_ticket_count)
  // Read as one phrase; the visible parts are separate spans with no spaces between them.
  const label = `Floor ${floor.floor_number}${floor.is_active ? '' : ', inactive'}, ${seatCount}, ${tickets}`

  return (
    // The summary sits in an h4, under the building's "Floors" h3.
    <Accordion disableGutters variant="outlined" slotProps={{ heading: { component: 'h4' } }}>
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        aria-controls={`floor-${floor.floor_id}-content`}
        id={`floor-${floor.floor_id}-header`}
        aria-label={label}
      >
        <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography component="span" fontWeight={600}>
            Floor {floor.floor_number}
          </Typography>
          {!floor.is_active && <InactiveChip />}
          <Typography component="span" variant="body2" color="text.secondary">
            {seatCount} · {tickets}
          </Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2}>
          {hidden && (
            <Typography variant="body2" color="text.secondary">
              {hidden}
            </Typography>
          )}
          <FacilityActions kind="floor" item={floor} onAction={(type) => onAction(type, 'floor', floor)} />
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            role="group"
            aria-label={`Seats on Floor ${floor.floor_number}`}
            sx={{ flexWrap: 'wrap', alignItems: 'center' }}
          >
            {floor.seats.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No seats yet.
              </Typography>
            )}
            <SeatChips seats={floor.seats} onAction={(type, seat) => onAction(type, 'seat', seat, floor)} />
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddIcon />}
              aria-label={`Add a seat to Floor ${floor.floor_number}`}
              onClick={() => onAction('add', 'seat', null, floor)}
            >
              Add seat
            </Button>
          </Stack>
        </Stack>
      </AccordionDetails>
    </Accordion>
  )
}

FloorAccordion.propTypes = {
  building: PropTypes.shape({
    building_name: PropTypes.string.isRequired,
    is_active: PropTypes.bool.isRequired,
  }).isRequired,
  floor: floorShape.isRequired,
  onAction: PropTypes.func.isRequired,
}

export default FloorAccordion
