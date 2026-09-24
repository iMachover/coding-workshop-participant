import { useState } from 'react'
import PropTypes from 'prop-types'
import { useMediaQuery } from 'react-responsive'
import { Link as RouterLink } from 'react-router'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Card from '@mui/material/Card'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Link from '@mui/material/Link'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Skeleton from '@mui/material/Skeleton'
import Snackbar from '@mui/material/Snackbar'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import BlockIcon from '@mui/icons-material/Block'
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import MoreVertIcon from '@mui/icons-material/MoreVert'

import FacilityConfirmDialog from '../components/admin/FacilityConfirmDialog'
import FacilityNameDialog from '../components/admin/FacilityNameDialog'
import { visuallyHiddenSx } from '../components/admin/panelStyles'
import ErrorState from '../components/ErrorState'
import useApiData from '../hooks/useApiData'
import { getFacilities } from '../services/adminFacilityService'
import { activeTicketsText, facilityName, hiddenByParent } from '../utils/facilities'

// What a new floor or seat is added to.
const PARENT_KIND = { building: undefined, floor: 'building', seat: 'floor' }

// Below MUI's "md" (900px) the three columns don't fit, so floors stack and expand instead.
const STACKED_MAX_WIDTH = 899

// On larger screens the page fills the window below the header, so the columns scroll
// instead of the page. From lg (1200px) AppLayout's full-screen frame already sizes
// <main> to that space; between md and lg it doesn't, so subtract the 48px header and
// <main>'s top and bottom padding (16px each).
const FIT_HEIGHT = { md: 'calc(100dvh - 80px)', lg: '100%' }

const SELECTED_BG = '#F0F7FC'
const INACTIVE_BG = '#EEEEEE'

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

const buildingShape = PropTypes.shape({
  building_id: PropTypes.number.isRequired,
  building_name: PropTypes.string.isRequired,
  is_active: PropTypes.bool.isRequired,
  active_ticket_count: PropTypes.number.isRequired,
  floors: PropTypes.arrayOf(floorShape).isRequired,
})

// A column's 48px title bar.
const columnHeaderSx = {
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  minHeight: 48,
  px: 2,
  py: 0.75,
  flex: 'none',
  borderBottom: 1,
  borderColor: 'divider',
  boxSizing: 'border-box',
}

// The columns' 14px navy titles.
const columnTitleSx = { m: 0, fontSize: 14, fontWeight: 600, lineHeight: 1.4, color: 'secondary.main' }

const captionSx = { fontSize: 12, color: 'text.secondary' }

/** "1 seat", "3 seats". */
function plural(count, word) {
  return `${count} ${count === 1 ? word : `${word}s`}`
}

/** Every seat in a building. */
function seatTotal(building) {
  return building.floors.reduce((sum, floor) => sum + floor.seats.length, 0)
}

/** "Floor 3, inactive, 2 seats, 2 active tickets": how a floor's button reads aloud. */
function floorLabel(floor) {
  const inactive = floor.is_active ? '' : ', inactive'
  return `Floor ${floor.floor_number}${inactive}, ${plural(floor.seats.length, 'seat')}, ${activeTicketsText(floor.active_ticket_count)}`
}

/** The message shown once an action succeeds. `item` is the saved item (null after a delete). */
function successMessage({ type, kind, item: before, parent, parentKind }, item) {
  const name = facilityName(kind, item ?? before)
  if (type === 'add') return parent ? `Added ${name} to ${facilityName(parentKind, parent)}.` : `Added ${name}.`
  if (type === 'rename') return `Saved as ${name}.`
  if (type === 'deactivate') return `${name} is inactive. Employees can't pick it for new tickets.`
  if (type === 'reactivate') return `${name} is active again.`
  return `Deleted ${name}.`
}

/** A small grey rounded tag, e.g. "Inactive". */
function Pill({ children }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 18,
        px: 0.75,
        borderRadius: '9px',
        fontSize: 11,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        flex: 'none',
        bgcolor: INACTIVE_BG,
        color: '#424242',
      }}
    >
      {children}
    </Box>
  )
}

Pill.propTypes = { children: PropTypes.node.isRequired }

/**
 * A building's active tickets in total, as a link to them on the dashboard when there
 * are any. The only total on the page: rows and seats just show a dot.
 */
function TicketsLink({ building }) {
  if (!building.active_ticket_count) return <span>No active tickets</span>
  return (
    <Link component={RouterLink} to={`/admin?building=${building.building_id}`}>
      {activeTicketsText(building.active_ticket_count)}
    </Link>
  )
}

TicketsLink.propTypes = { building: buildingShape.isRequired }

/** Marks a building, floor or seat with active tickets, at it or anywhere inside it. */
function TicketDot({ sx }) {
  return (
    <Box
      component="span"
      aria-hidden="true"
      sx={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main', flex: 'none', ...sx }}
    />
  )
}

TicketDot.propTypes = { sx: PropTypes.object }

// Tickets reported for a whole building or floor belong to none of its floors or seats.
const WHOLE_AREA_WORDS = {
  building: { area: 'building-wide', notIn: 'not on any floor' },
  floor: { area: 'floor-wide', notIn: 'not at any seat' },
}

/**
 * "2 floor-wide tickets, not at any seat": the active tickets no floor or seat inside a
 * building or floor shows, i.e. its count minus its parts'. Nothing when there are none.
 */
function WholeAreaTickets({ kind, total, parts, sx }) {
  const count = total - parts.reduce((sum, part) => sum + part.active_ticket_count, 0)
  if (count <= 0) return null
  const { area, notIn } = WHOLE_AREA_WORDS[kind]
  return (
    <Typography sx={{ ...captionSx, display: 'flex', alignItems: 'center', gap: 0.75, ...sx }}>
      <TicketDot />
      {`${count} ${area} ${count === 1 ? 'ticket' : 'tickets'}, ${notIn}`}
    </Typography>
  )
}

WholeAreaTickets.propTypes = {
  kind: PropTypes.oneOf(['building', 'floor']).isRequired,
  total: PropTypes.number.isRequired,
  parts: PropTypes.arrayOf(PropTypes.shape({ active_ticket_count: PropTypes.number.isRequired })).isRequired,
  sx: PropTypes.object,
}

/**
 * Rename (renumber), deactivate or reactivate, and delete, for a building or a floor.
 * `icons` gives compact icon buttons with tooltips; otherwise small text buttons. Each
 * name includes the item's, e.g. "Delete Floor 3", so screen readers can tell them apart.
 */
function ItemActions({ kind, item, onAction, icons = false }) {
  const name = facilityName(kind, item)
  const actions = [
    { type: 'rename', label: kind === 'building' ? 'Rename' : 'Renumber', Icon: EditOutlinedIcon },
    item.is_active
      ? { type: 'deactivate', label: 'Deactivate', Icon: BlockIcon }
      : { type: 'reactivate', label: 'Reactivate', Icon: CheckCircleOutlinedIcon },
    { type: 'delete', label: 'Delete', Icon: DeleteOutlinedIcon, color: 'error' },
  ]

  return (
    <Box sx={{ display: 'flex', gap: icons ? 0 : 0.5, flex: 'none' }}>
      {actions.map(({ type, label, Icon, color }) =>
        icons ? (
          <Tooltip key={type} title={label} describeChild>
            <IconButton size="small" aria-label={`${label} ${name}`} onClick={() => onAction(type)}>
              <Icon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        ) : (
          <Button
            key={type}
            size="small"
            color={color}
            startIcon={<Icon sx={{ fontSize: '16px !important' }} />}
            aria-label={`${label} ${name}`}
            onClick={() => onAction(type)}
            sx={{ fontSize: 13, px: 1.25 }}
          >
            {label}
          </Button>
        ),
      )}
    </Box>
  )
}

ItemActions.propTypes = {
  kind: PropTypes.oneOf(['building', 'floor']).isRequired,
  item: PropTypes.shape({ is_active: PropTypes.bool.isRequired }).isRequired,
  onAction: PropTypes.func.isRequired,
  icons: PropTypes.bool,
}

/**
 * A floor's seats as tiles. Inactive ones are grey and struck through; a blue dot marks
 * active tickets (the tooltip and label say how many). Choosing a seat opens its actions
 * (renumber, deactivate or reactivate, delete). `onAction(type, seat)`.
 */
function SeatGrid({ floor, onAction, sx }) {
  const [menu, setMenu] = useState(null)
  const close = () => setMenu(null)
  const choose = (type) => {
    const { seat } = menu
    close()
    onAction(type, seat)
  }

  return (
    <Box
      role="group"
      aria-label={`Seats on Floor ${floor.floor_number}`}
      sx={{ display: 'grid', gap: 1, alignContent: 'start', ...sx }}
    >
      {floor.seats.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ gridColumn: '1 / -1' }}>
          No seats yet.
        </Typography>
      )}
      {floor.seats.map((seat) => {
        const tickets = seat.active_ticket_count
        const ticketsText = tickets ? activeTicketsText(tickets) : ''
        return (
          <ButtonBase
            key={seat.seat_id}
            title={ticketsText ? `${seat.seat_number} · ${ticketsText}` : seat.seat_number}
            aria-label={`Seat ${seat.seat_number}${seat.is_active ? '' : ', inactive'}${ticketsText ? `, ${ticketsText}` : ''}`}
            aria-haspopup="menu"
            onClick={(event) => setMenu({ anchor: event.currentTarget, seat })}
            sx={{
              position: 'relative',
              height: 40,
              px: 1.5,
              borderRadius: '6px',
              border: '1px solid',
              borderColor: seat.is_active ? 'rgba(0, 0, 0, 0.23)' : 'transparent',
              bgcolor: seat.is_active ? 'background.paper' : INACTIVE_BG,
              color: seat.is_active ? 'text.primary' : 'text.secondary',
              textDecoration: seat.is_active ? 'none' : 'line-through',
              fontSize: 13,
              fontWeight: 500,
              '&:hover': { borderColor: 'primary.main' },
              '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 1 },
            }}
          >
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {seat.seat_number}
            </Box>
            {tickets > 0 && <TicketDot sx={{ position: 'absolute', top: 5, right: 6 }} />}
          </ButtonBase>
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
    </Box>
  )
}

SeatGrid.propTypes = {
  floor: floorShape.isRequired,
  onAction: PropTypes.func.isRequired,
  sx: PropTypes.object,
}

/** Desktop column 1: every building, to choose which one to manage. */
function BuildingsColumn({ buildings, selectedId, onSelect }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: 1, borderColor: 'divider' }}>
      <Box sx={columnHeaderSx}>
        <Typography component="h2" sx={columnTitleSx}>
          Buildings
        </Typography>
        <Typography component="span" sx={captionSx}>
          {buildings.length}
        </Typography>
      </Box>
      <List aria-label="Buildings" disablePadding sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {buildings.map((b) => {
          const selected = b.building_id === selectedId
          return (
            <ListItemButton
              key={b.building_id}
              selected={selected}
              aria-current={selected ? 'true' : undefined}
              onClick={() => onSelect(b.building_id)}
              sx={{
                gap: 1,
                py: 1.25,
                pl: 1.75,
                pr: 1,
                borderLeft: '3px solid',
                borderLeftColor: selected ? 'primary.main' : 'transparent',
                borderBottom: 1,
                borderBottomColor: 'divider',
                '&.Mui-selected, &.Mui-selected:hover': { bgcolor: SELECTED_BG },
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  sx={{
                    fontSize: 14,
                    fontWeight: 600,
                    overflowWrap: 'anywhere',
                    color: !b.is_active ? 'text.secondary' : selected ? 'secondary.main' : 'text.primary',
                  }}
                >
                  {b.building_name}
                </Typography>
                <Box sx={{ ...captionSx, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75, mt: 0.25 }}>
                  {plural(b.floors.length, 'floor')} · {plural(seatTotal(b), 'seat')}
                  {!b.is_active && <Pill>Inactive</Pill>}
                </Box>
              </Box>
              {b.active_ticket_count > 0 && (
                <>
                  <TicketDot />
                  <Box component="span" sx={visuallyHiddenSx}>
                    , has active tickets
                  </Box>
                </>
              )}
              <ChevronRightIcon aria-hidden="true" sx={{ fontSize: 20, color: 'action.active' }} />
            </ListItemButton>
          )
        })}
      </List>
    </Box>
  )
}

BuildingsColumn.propTypes = {
  buildings: PropTypes.arrayOf(buildingShape).isRequired,
  selectedId: PropTypes.number.isRequired,
  onSelect: PropTypes.func.isRequired,
}

/** Desktop column 2: the chosen building's name, actions and floors. */
function FloorsColumn({ building, floor, onSelectFloor, onAction }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: 1, borderColor: 'divider' }}>
      <Box sx={{ ...columnHeaderSx, pr: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography
              id="building-title"
              component="h2"
              sx={{ ...columnTitleSx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {building.building_name}
            </Typography>
            {!building.is_active && <Pill>Inactive</Pill>}
          </Box>
          <Typography sx={captionSx}>
            {plural(building.floors.length, 'floor')} · <TicketsLink building={building} />
          </Typography>
        </Box>
        <ItemActions icons kind="building" item={building} onAction={(type) => onAction(type, 'building', building)} />
      </Box>
      {!building.is_active && (
        <Typography sx={{ ...captionSx, px: 2, py: 1, bgcolor: INACTIVE_BG, flex: 'none' }}>
          Employees can&apos;t pick it, or any floor or seat in it, for new tickets.
        </Typography>
      )}
      <WholeAreaTickets
        kind="building"
        total={building.active_ticket_count}
        parts={building.floors}
        sx={{ px: 2, py: 1, flex: 'none', borderBottom: 1, borderColor: 'divider' }}
      />

      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {building.floors.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            No floors yet.
          </Typography>
        ) : (
          <List aria-label={`Floors in ${building.building_name}`} disablePadding>
            {building.floors.map((f) => {
              const selected = f.floor_id === floor?.floor_id
              return (
                <ListItemButton
                  key={f.floor_id}
                  selected={selected}
                  aria-current={selected ? 'true' : undefined}
                  aria-label={floorLabel(f)}
                  onClick={() => onSelectFloor(f.floor_id)}
                  sx={{
                    gap: 1,
                    minHeight: 44,
                    pl: 1.75,
                    pr: 1,
                    borderLeft: '3px solid',
                    borderLeftColor: selected ? 'primary.main' : 'transparent',
                    borderBottom: 1,
                    borderBottomColor: 'divider',
                    '&.Mui-selected, &.Mui-selected:hover': { bgcolor: SELECTED_BG },
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Typography
                      component="span"
                      sx={{
                        fontSize: 14,
                        fontWeight: selected ? 600 : 400,
                        color: !f.is_active ? 'text.secondary' : selected ? 'secondary.main' : 'text.primary',
                      }}
                    >
                      Floor {f.floor_number}
                    </Typography>
                    {!f.is_active && <Pill>Inactive</Pill>}
                  </Box>
                  {f.active_ticket_count > 0 && <TicketDot />}
                  <Typography component="span" sx={captionSx}>
                    {plural(f.seats.length, 'seat')}
                  </Typography>
                  <ChevronRightIcon aria-hidden="true" sx={{ fontSize: 20, color: 'action.active' }} />
                </ListItemButton>
              )
            })}
          </List>
        )}
      </Box>

      <Button
        startIcon={<AddIcon />}
        onClick={() => onAction('add', 'floor', null, building)}
        sx={{
          flex: 'none',
          justifyContent: 'flex-start',
          minHeight: 44,
          px: 2,
          borderTop: 1,
          borderColor: 'divider',
          borderRadius: 0,
        }}
      >
        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Add a floor to {building.building_name}
        </Box>
      </Button>
    </Box>
  )
}

FloorsColumn.propTypes = {
  building: buildingShape.isRequired,
  floor: floorShape,
  onSelectFloor: PropTypes.func.isRequired,
  onAction: PropTypes.func.isRequired,
}

/** One entry in the seat legend. */
function LegendItem({ swatch, children }) {
  return (
    <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      {swatch}
      {children}
    </Box>
  )
}

LegendItem.propTypes = {
  swatch: PropTypes.node.isRequired,
  children: PropTypes.node.isRequired,
}

/** Desktop column 3: the chosen floor's actions and its seats. */
function SeatsColumn({ building, floor, onAction }) {
  if (!floor) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
        <Typography color="text.secondary" sx={{ textAlign: 'center' }}>
          Add a floor to {building.building_name}, then add its seats here.
        </Typography>
      </Box>
    )
  }

  const inactiveSeats = floor.seats.filter((s) => !s.is_active).length
  const hidden = floor.is_active ? hiddenByParent(building) : ''

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Box sx={{ ...columnHeaderSx, px: 2.5, pr: 1.5, flexWrap: 'wrap', rowGap: 0.5 }}>
        <Box sx={{ flex: 1, minWidth: 140 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography component="h3" sx={columnTitleSx}>
              Floor {floor.floor_number}
            </Typography>
            {!floor.is_active && <Pill>Inactive</Pill>}
          </Box>
          <Typography sx={captionSx}>
            {plural(floor.seats.length, 'seat')} · {inactiveSeats} inactive
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
          <ItemActions kind="floor" item={floor} onAction={(type) => onAction(type, 'floor', floor)} />
          <Button
            size="small"
            variant="outlined"
            startIcon={<AddIcon sx={{ fontSize: '16px !important' }} />}
            aria-label={`Add a seat to Floor ${floor.floor_number}`}
            onClick={() => onAction('add', 'seat', null, floor)}
            sx={{ fontSize: 13, flex: 'none' }}
          >
            Add a seat
          </Button>
        </Box>
      </Box>

      <WholeAreaTickets kind="floor" total={floor.active_ticket_count} parts={floor.seats} sx={{ px: 2.5, pt: 1.25, flex: 'none' }} />
      <Box
        sx={{
          ...captionSx,
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          columnGap: 2,
          rowGap: 0.5,
          px: 2.5,
          py: 1.25,
          flex: 'none',
        }}
      >
        <LegendItem
          swatch={<Box component="span" sx={{ width: 12, height: 12, borderRadius: '3px', border: '1px solid rgba(0, 0, 0, 0.23)' }} />}
        >
          Active seat
        </LegendItem>
        <LegendItem swatch={<Box component="span" sx={{ width: 12, height: 12, borderRadius: '3px', bgcolor: INACTIVE_BG }} />}>
          Inactive seat
        </LegendItem>
        <LegendItem swatch={<TicketDot />}>Has active tickets</LegendItem>
        <Box component="span" sx={{ ml: 'auto' }}>
          {hidden || 'Click a seat to renumber, deactivate or delete it'}
        </Box>
      </Box>

      <SeatGrid
        floor={floor}
        onAction={(type, seat) => onAction(type, 'seat', seat, floor)}
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          px: 2.5,
          pb: 2.5,
          gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
        }}
      />
    </Box>
  )
}

SeatsColumn.propTypes = {
  building: buildingShape.isRequired,
  floor: floorShape,
  onAction: PropTypes.func.isRequired,
}

/**
 * Phones and tablets: one floor row per floor; tapping it expands its seats, with
 * "Add a seat" and a menu of the floor's own actions.
 */
function StackedFloor({ building, floor, open, onToggle, onAction }) {
  const [menuAnchor, setMenuAnchor] = useState(null)
  const hidden = floor.is_active ? hiddenByParent(building) : ''
  const choose = (type) => {
    setMenuAnchor(null)
    onAction(type, 'floor', floor)
  }
  const ExpandIcon = open ? ExpandLessIcon : ExpandMoreIcon

  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <ButtonBase
        aria-label={floorLabel(floor)}
        aria-expanded={open}
        aria-controls={`floor-${floor.floor_id}-content`}
        onClick={onToggle}
        sx={{
          width: '100%',
          minHeight: 48,
          pl: 1.75,
          pr: 1,
          gap: 1,
          justifyContent: 'flex-start',
          bgcolor: open ? SELECTED_BG : 'transparent',
        }}
      >
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
          <Typography
            component="span"
            sx={{
              fontSize: 15,
              fontWeight: open ? 600 : 400,
              color: !floor.is_active ? 'text.secondary' : open ? 'secondary.main' : 'text.primary',
            }}
          >
            Floor {floor.floor_number}
          </Typography>
          {!floor.is_active && <Pill>Inactive</Pill>}
        </Box>
        {floor.active_ticket_count > 0 && <TicketDot />}
        <Typography component="span" sx={captionSx}>
          {plural(floor.seats.length, 'seat')}
        </Typography>
        <ExpandIcon aria-hidden="true" sx={{ fontSize: 22, color: 'action.active' }} />
      </ButtonBase>

      {open && (
        <Box
          id={`floor-${floor.floor_id}-content`}
          sx={{ px: 1.75, pt: 0.5, pb: 1.75, bgcolor: SELECTED_BG, display: 'flex', flexDirection: 'column', gap: 1.25 }}
        >
          {hidden && <Typography sx={captionSx}>{hidden}</Typography>}
          <WholeAreaTickets kind="floor" total={floor.active_ticket_count} parts={floor.seats} />
          <SeatGrid
            floor={floor}
            onAction={(type, seat) => onAction(type, 'seat', seat, floor)}
            sx={{ gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 0.75 }}
          />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              aria-label={`Add a seat to Floor ${floor.floor_number}`}
              onClick={() => onAction('add', 'seat', null, floor)}
              sx={{ flex: 1, minHeight: 44, bgcolor: 'background.paper' }}
            >
              Add a seat
            </Button>
            <IconButton
              aria-label={`More actions for Floor ${floor.floor_number}`}
              aria-haspopup="menu"
              onClick={(event) => setMenuAnchor(event.currentTarget)}
              sx={{ width: 44, height: 44, border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}
            >
              <MoreVertIcon />
            </IconButton>
          </Box>
          <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
            <MenuItem onClick={() => choose('rename')}>Renumber</MenuItem>
            {floor.is_active ? (
              <MenuItem onClick={() => choose('deactivate')}>Deactivate</MenuItem>
            ) : (
              <MenuItem onClick={() => choose('reactivate')}>Reactivate</MenuItem>
            )}
            <MenuItem onClick={() => choose('delete')} sx={{ color: 'error.main' }}>
              Delete
            </MenuItem>
          </Menu>
        </Box>
      )}
    </Box>
  )
}

StackedFloor.propTypes = {
  building: buildingShape.isRequired,
  floor: floorShape.isRequired,
  open: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  onAction: PropTypes.func.isRequired,
}

/**
 * Facility Admin facilities page: the buildings, floors and seats employees pick from
 * when they report an issue. On larger screens it fills the window with three columns
 * (buildings, the chosen building's floors, the chosen floor's seats) that scroll on
 * their own; on phones and tablets a building dropdown sits above floors that expand to
 * show their seats. Everything can be added, renamed, deactivated or reactivated, and
 * deleted if nothing has used it yet; each change goes through a dialog, then the tree
 * reloads.
 */
function FacilitiesPage() {
  const stacked = useMediaQuery({ maxWidth: STACKED_MAX_WIDTH })
  const facilities = useApiData(getFacilities)
  const [selectedId, setSelectedId] = useState(null)
  // The chosen floor (desktop), or the expanded one (stacked; null = all collapsed).
  const [floorId, setFloorId] = useState(null)
  // The open dialog, and a counter so each one starts fresh.
  const [action, setAction] = useState(null)
  const [actionCount, setActionCount] = useState(0)
  const [notice, setNotice] = useState('')
  const buildings = facilities.data ?? []
  // A deleted (or not yet chosen) building falls back to the first one; likewise its floor.
  const building = buildings.find((b) => b.building_id === selectedId) ?? buildings[0]
  const chosenFloor = building?.floors.find((f) => f.floor_id === floorId)
  const floor = chosenFloor ?? building?.floors[0]

  const selectBuilding = (id) => {
    setSelectedId(id)
    setFloorId(null)
  }

  const openAction = (type, kind, item = null, parent = null) => {
    setAction({ type, kind, item, parent, parentKind: PARENT_KIND[kind] })
    setActionCount((n) => n + 1)
  }

  const handleDone = (item) => {
    if (action.type === 'add' && action.kind === 'building') selectBuilding(item.building_id)
    if (action.type === 'add' && action.kind === 'floor') setFloorId(item.floor_id)
    setNotice(successMessage(action, item))
    setAction(null)
    facilities.reload()
  }

  const updating = facilities.loading && (
    <LinearProgress
      aria-label="Updating facilities"
      sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 }}
    />
  )

  let content
  if (facilities.error) {
    content = <ErrorState message={facilities.error.message} onRetry={facilities.reload} />
  } else if (!facilities.data) {
    content = <Skeleton variant="rounded" aria-label="Loading facilities" sx={{ height: { xs: 320, md: 'auto' }, flex: { md: 1 } }} />
  } else if (!building) {
    content = (
      <Card sx={{ p: 2 }}>
        <Typography>No buildings yet. Add the first one to start.</Typography>
      </Card>
    )
  } else if (stacked) {
    content = (
      <Box aria-busy={facilities.loading} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <TextField
          select
          label="Building"
          size="small"
          fullWidth
          value={String(building.building_id)}
          onChange={(event) => selectBuilding(Number(event.target.value))}
          sx={{ bgcolor: 'background.paper' }}
        >
          {buildings.map((b) => (
            <MenuItem key={b.building_id} value={String(b.building_id)}>
              {b.is_active ? b.building_name : `${b.building_name} (inactive)`}
            </MenuItem>
          ))}
        </TextField>

        <Card component="section" aria-labelledby="building-title" sx={{ position: 'relative' }}>
          {updating}
          <Box sx={{ ...columnHeaderSx, pl: 1.75, pr: 0.5 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography id="building-title" component="h2" sx={{ ...columnTitleSx, fontSize: 15, overflowWrap: 'anywhere' }}>
                  {building.building_name}
                </Typography>
                {!building.is_active && <Pill>Inactive</Pill>}
              </Box>
              <Typography sx={captionSx}>
                {plural(building.floors.length, 'floor')} · {plural(seatTotal(building), 'seat')} ·{' '}
                <TicketsLink building={building} />
              </Typography>
            </Box>
            <ItemActions icons kind="building" item={building} onAction={(type) => openAction(type, 'building', building)} />
          </Box>
          {!building.is_active && (
            <Typography sx={{ ...captionSx, px: 1.75, py: 1, bgcolor: INACTIVE_BG }}>
              Employees can&apos;t pick it, or any floor or seat in it, for new tickets.
            </Typography>
          )}
          <WholeAreaTickets
            kind="building"
            total={building.active_ticket_count}
            parts={building.floors}
            sx={{ px: 1.75, py: 1, borderBottom: 1, borderColor: 'divider' }}
          />
          {building.floors.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 1.75 }}>
              No floors yet.
            </Typography>
          )}
          {building.floors.map((f) => (
            <StackedFloor
              key={f.floor_id}
              building={building}
              floor={f}
              open={f.floor_id === chosenFloor?.floor_id}
              onToggle={() => setFloorId(f.floor_id === chosenFloor?.floor_id ? null : f.floor_id)}
              onAction={openAction}
            />
          ))}
          <Button
            startIcon={<AddIcon />}
            onClick={() => openAction('add', 'floor', null, building)}
            sx={{ width: '100%', justifyContent: 'flex-start', minHeight: 48, px: 1.75, borderRadius: 0 }}
          >
            Add a floor to {building.building_name}
          </Button>
        </Card>
      </Box>
    )
  } else {
    content = (
      <Card
        aria-busy={facilities.loading}
        sx={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: { md: '220px minmax(0, 1fr)', lg: '260px minmax(0, 1fr)' },
          gridTemplateRows: 'minmax(0, 1fr)',
        }}
      >
        {updating}
        <BuildingsColumn buildings={buildings} selectedId={building.building_id} onSelect={selectBuilding} />
        <Box
          component="section"
          aria-labelledby="building-title"
          sx={{
            display: 'grid',
            gridTemplateColumns: { md: '240px minmax(0, 1fr)', lg: '280px minmax(0, 1fr)' },
            gridTemplateRows: 'minmax(0, 1fr)',
            minHeight: 0,
          }}
        >
          <FloorsColumn building={building} floor={floor} onSelectFloor={setFloorId} onAction={openAction} />
          <SeatsColumn building={building} floor={floor} onAction={openAction} />
        </Box>
      </Card>
    )
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        height: FIT_HEIGHT,
        minHeight: { md: 480 },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: { xs: 'wrap', md: 'nowrap' }, columnGap: 1.5, rowGap: 0.5, flex: 'none' }}>
        <Typography variant="h4" component="h1" sx={{ fontSize: 22, whiteSpace: 'nowrap' }}>
          Facilities
        </Typography>
        <Typography sx={{ fontSize: 13, color: 'text.secondary', order: { xs: 3, md: 0 }, flexBasis: { xs: '100%', md: 'auto' } }}>
          The locations employees pick when they report an issue. Deactivating a location stops new tickets there; its
          existing tickets keep it.
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => openAction('add', 'building')}
          sx={{ ml: 'auto', flex: 'none' }}
        >
          Add building
        </Button>
      </Box>

      {content}

      {action && ['add', 'rename'].includes(action.type) && (
        <FacilityNameDialog key={actionCount} action={action} onClose={() => setAction(null)} onSaved={handleDone} />
      )}
      {action && ['deactivate', 'reactivate', 'delete'].includes(action.type) && (
        <FacilityConfirmDialog
          key={actionCount}
          action={action}
          onClose={() => setAction(null)}
          onDone={handleDone}
          onDeactivateInstead={() => openAction('deactivate', action.kind, action.item, action.parent)}
        />
      )}

      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={6000}
        onClose={() => setNotice('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled" onClose={() => setNotice('')}>
          {notice}
        </Alert>
      </Snackbar>
    </Box>
  )
}

export default FacilitiesPage
