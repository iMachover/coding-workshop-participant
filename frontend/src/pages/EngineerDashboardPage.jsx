import { useState } from 'react'
import PropTypes from 'prop-types'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import LinearProgress from '@mui/material/LinearProgress'
import Link from '@mui/material/Link'
import MenuItem from '@mui/material/MenuItem'
import Skeleton from '@mui/material/Skeleton'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import BlockIcon from '@mui/icons-material/Block'
import BuildIcon from '@mui/icons-material/Build'
import CancelIcon from '@mui/icons-material/Cancel'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutlineOutlined'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutlineOutlined'
import PriorityHighIcon from '@mui/icons-material/PriorityHigh'
import SearchIcon from '@mui/icons-material/Search'
import TaskAltIcon from '@mui/icons-material/TaskAlt'
import TuneIcon from '@mui/icons-material/Tune'
import { Link as RouterLink, useNavigate } from 'react-router'

import useAuth from '../auth/useAuth'
import { panelHeadingSx } from '../components/admin/panelStyles'
import { PriorityPill, StatusPill } from '../components/admin/TicketPills'
import ErrorState from '../components/ErrorState'
import ReasonDialog from '../components/tickets/ReasonDialog'
import useApiData from '../hooks/useApiData'
import useDebouncedValue from '../hooks/useDebouncedValue'
import useIsMobile from '../hooks/useIsMobile'
import { ApiError } from '../services/apiClient'
import {
  addAssignedTicketNote,
  changeTicketStatus,
  getAssignedTicket,
  listMyQueue,
} from '../services/engineerTicketService'
import { listBuildings } from '../services/locationService'
import { brand } from '../theme'
import { pickCurrentTicket } from '../utils/engineerQueue'
import {
  CATEGORIES,
  formatAge,
  formatDateTime,
  formatLocation,
  PRIORITIES,
  STATUSES,
} from '../utils/ticketFormat'
import { engineerMoves } from '../utils/ticketWorkflow'

// AppLayout gives this page its full-screen frame: on large screens the frame is the window
// below the header, so the page fills it and nothing scrolls but the panels.
const FILL_FRAME_SX = { height: '100%' }
const GAP = 1.5
const ESCALATED = '#B3261E'

// Soft shadows at the top and bottom of a scroll area while there's more to see.
const SCROLL_SX = {
  overflow: 'auto',
  background: [
    'linear-gradient(#fff 30%, rgba(255,255,255,0)) center top / 100% 40px no-repeat local',
    'linear-gradient(rgba(255,255,255,0), #fff 70%) center bottom / 100% 40px no-repeat local',
    'radial-gradient(farthest-side at 50% 0, rgba(0,0,0,.14), rgba(0,0,0,0)) center top / 100% 14px no-repeat scroll',
    'radial-gradient(farthest-side at 50% 100%, rgba(0,0,0,.14), rgba(0,0,0,0)) center bottom / 100% 14px no-repeat scroll',
  ].join(', '),
}

// Search and the dropdowns: 34px tall with 13px text, as in the mockup.
const FIELD_SX = { '& .MuiInputBase-root': { height: 34, fontSize: 13 } }

const ellipsis = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }

/** Cuts text off after `lines` lines with an ellipsis. */
const clampLines = (lines) => ({
  display: '-webkit-box',
  WebkitLineClamp: lines,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
})

// `tile` is the count tile that set the status or priority filter, so it shows as pressed.
const DEFAULT_FILTERS = { view: 'active', q: '', status: '', priority: '', building_id: '', tile: '' }
const ACTIVE = { view: 'active' }

const isP1Active = (t) => t.priority === 'P1' && t.status !== 'resolved'

// The clickable count row, over the engineer's active tickets. Each one filters the list.
// Resolved tickets wait for an admin to close them, so they aren't "P1 active".
const TILES = [
  { key: 'open', label: 'To start', sub: 'assigned, not started', dot: brand.sky, filter: { status: 'open' } },
  { key: 'in_progress', label: STATUSES.in_progress.label, sub: 'on the go', dot: '#ED6C02', filter: { status: 'in_progress' } },
  { key: 'blocked', label: STATUSES.blocked.label, sub: 'waiting', dot: '#D32F2F', filter: { status: 'blocked' } },
  { key: 'p1', label: 'P1 active', sub: 'critical', dot: ESCALATED, filter: { priority: 'P1' } },
  { key: 'resolved', label: STATUSES.resolved.label, sub: 'awaiting admin close', dot: '#2E7D32', filter: { status: 'resolved' } },
]

// What the toast says after each move.
const MOVE_NOTICES = {
  in_progress: (id) => `Started #${id}.`,
  resolved: (id) => `#${id} marked resolved. An admin will close it.`,
  blocked: (id) => `#${id} marked blocked.`,
}

const ticketShape = PropTypes.shape({
  ticket_id: PropTypes.number.isRequired,
  title: PropTypes.string.isRequired,
  category: PropTypes.oneOf(Object.keys(CATEGORIES)).isRequired,
  status: PropTypes.oneOf(Object.keys(STATUSES)).isRequired,
  priority: PropTypes.oneOf(Object.keys(PRIORITIES)).isRequired,
  escalation_requested: PropTypes.bool.isRequired,
  building_name: PropTypes.string.isRequired,
  floor_number: PropTypes.number,
  seat_number: PropTypes.string,
  created_by_name: PropTypes.string.isRequired,
  created_at: PropTypes.string.isRequired,
  updated_at: PropTypes.string.isRequired,
})

const listShape = PropTypes.shape({
  tickets: PropTypes.arrayOf(ticketShape).isRequired,
  loading: PropTypes.bool.isRequired,
  error: PropTypes.instanceOf(Error),
  reload: PropTypes.func.isRequired,
})

const filtersShape = PropTypes.shape({
  view: PropTypes.oneOf(['active', 'all']).isRequired,
  q: PropTypes.string.isRequired,
  status: PropTypes.string.isRequired,
  priority: PropTypes.string.isRequired,
  building_id: PropTypes.string.isRequired,
  tile: PropTypes.string.isRequired,
})

const buildingsShape = PropTypes.arrayOf(
  PropTypes.shape({
    building_id: PropTypes.number.isRequired,
    building_name: PropTypes.string.isRequired,
  }),
)

const ticketPath = (ticket) => `/engineer/tickets/${ticket.ticket_id}`

const errorMessage = (err) => (err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')

/** "20 min ago", "3 h ago", or "just now". */
function ago(iso) {
  const age = formatAge(iso)
  return age === 'just now' ? age : `${age} ago`
}

/**
 * The count row's numbers, over the engineer's active tickets.
 * @param {Array<{status: string, priority: string}>} tickets
 */
function countTiles(tickets) {
  const counts = { open: 0, in_progress: 0, blocked: 0, resolved: 0, p1: 0 }
  for (const ticket of tickets) {
    if (ticket.status in counts) counts[ticket.status] += 1
    if (isP1Active(ticket)) counts.p1 += 1
  }
  return counts
}

/** The red "!" beside an escalated ticket's title. */
function EscalatedMark() {
  return (
    <Tooltip title="Escalated">
      {/* titleAccess keeps the icon visible to screen readers, which MUI otherwise hides. */}
      <PriorityHighIcon titleAccess="Escalated" sx={{ fontSize: 15, color: ESCALATED, flex: 'none' }} />
    </Tooltip>
  )
}

/** Title and greeting. */
function PageHeader({ firstName, compact }) {
  return (
    <Box
      sx={{
        flex: 'none',
        display: 'flex',
        flexDirection: compact ? 'column' : 'row',
        alignItems: compact ? 'flex-start' : 'baseline',
        columnGap: 1.5,
      }}
    >
      <Typography variant="h4" component="h1" sx={{ fontSize: compact ? 20 : 22, whiteSpace: 'nowrap' }}>
        My queue
      </Typography>
      <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
        Welcome back, {firstName}. These are the tickets assigned to you.
      </Typography>
    </Box>
  )
}

PageHeader.propTypes = {
  firstName: PropTypes.string.isRequired,
  compact: PropTypes.bool.isRequired,
}

function SummarySkeleton() {
  return (
    <Stack spacing={GAP} aria-label="Loading your queue" aria-busy="true">
      <Skeleton variant="rounded" height={64} />
      <Skeleton variant="rounded" height={320} />
    </Stack>
  )
}

/**
 * The clickable count row. A count filters the list (click again to clear). Phones
 * scroll the row sideways.
 */
function CountTiles({ counts, tile, onPick, compact }) {
  return (
    <Box
      component="ul"
      aria-label="My queue in numbers"
      sx={{
        flex: 'none',
        listStyle: 'none',
        m: 0,
        p: 0,
        ...(compact
          ? { display: 'flex', gap: 1, overflowX: 'auto', mx: -2, px: 2 }
          : {
              display: 'grid',
              gap: GAP,
              gridTemplateColumns: { xs: 'repeat(3, minmax(0,1fr))', md: 'repeat(5, minmax(0,1fr))' },
            }),
      }}
    >
      {TILES.map((t) => {
        const pressed = t.key === tile
        const dot = (
          <Box
            component="span"
            aria-hidden="true"
            sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: t.dot, flex: 'none' }}
          />
        )
        return (
          <Box component="li" key={t.key} sx={{ display: 'flex', flex: compact ? 'none' : undefined }}>
            <ButtonBase
              onClick={() => onPick(t.key)}
              aria-pressed={pressed}
              sx={{
                flex: 1,
                minWidth: compact ? 92 : 0,
                minHeight: compact ? 56 : 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                justifyContent: 'center',
                gap: compact ? 0 : 0.25,
                px: compact ? 1.25 : 1.75,
                py: compact ? 1 : 1.25,
                textAlign: 'left',
                borderRadius: 2,
                bgcolor: pressed ? '#F0F7FC' : 'background.paper',
                // The pressed outline is 2px, drawn inside so the tile doesn't shift.
                border: `1px solid ${pressed ? brand.blue : 'rgba(0,0,0,.12)'}`,
                boxShadow: pressed ? `inset 0 0 0 1px ${brand.blue}` : 'none',
                '&:hover': {
                  boxShadow: `${pressed ? `inset 0 0 0 1px ${brand.blue}, ` : ''}0 1px 4px rgba(0,59,112,.15)`,
                },
              }}
            >
              {compact ? (
                <>
                  <Box component="span" sx={{ fontSize: 22, fontWeight: 600, color: 'secondary.main', lineHeight: 1.1 }}>
                    {counts[t.key]}
                  </Box>
                  <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.625, fontSize: 12, color: 'rgba(0,0,0,.65)', whiteSpace: 'nowrap' }}>
                    {dot}
                    {t.label}
                  </Box>
                </>
              ) : (
                <>
                  <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 12, fontWeight: 500, color: 'text.secondary' }}>
                    {dot}
                    {t.label}
                  </Box>
                  <Box component="span" sx={{ display: 'flex', alignItems: 'baseline', gap: 1, minWidth: 0 }}>
                    <Box component="span" sx={{ fontSize: 26, fontWeight: 600, color: 'secondary.main', lineHeight: 1.1 }}>
                      {counts[t.key]}
                    </Box>
                    <Box component="span" sx={{ ...ellipsis, fontSize: 12, color: 'text.secondary' }}>
                      {t.sub}
                    </Box>
                  </Box>
                </>
              )}
            </ButtonBase>
          </Box>
        )
      })}
    </Box>
  )
}

CountTiles.propTypes = {
  counts: PropTypes.objectOf(PropTypes.number).isRequired,
  tile: PropTypes.string.isRequired,
  onPick: PropTypes.func.isRequired,
  compact: PropTypes.bool.isRequired,
}

/**
 * The ticket the engineer is working on (see pickCurrentTicket), or a prompt to start
 * the next one when nothing is in progress.
 */
function WorkingOnSection({ ticket, compact, onMove, onNoteAdded }) {
  if (!ticket) {
    return (
      <Box
        component="section"
        aria-label="Working on now"
        sx={{
          flex: 'none',
          bgcolor: 'background.paper',
          border: '1px dashed rgba(0,0,0,.25)',
          borderRadius: 2,
          p: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          fontSize: 14,
          color: 'rgba(0,0,0,.65)',
        }}
      >
        <PlayCircleOutlineIcon aria-hidden="true" color="primary" />
        Nothing in progress. Start the next ticket below.
      </Box>
    )
  }
  // Keyed by ticket so the dialogs and the detail fetch start fresh for a different one.
  return (
    <WorkingOnCard key={ticket.ticket_id} ticket={ticket} compact={compact} onMove={onMove} onNoteAdded={onNoteAdded} />
  )
}

WorkingOnSection.propTypes = {
  ticket: ticketShape,
  compact: PropTypes.bool.isRequired,
  onMove: PropTypes.func.isRequired,
  onNoteAdded: PropTypes.func.isRequired,
}

const MOVE_ICONS = { resolved: TaskAltIcon, blocked: BlockIcon }

/**
 * "Working on now": the in-progress ticket with its description, and the moves the
 * workflow allows from In Progress (resolve or block, each asking for a reason) plus a
 * note for the requester. `onMove(ticket, to, reason)` rejects if the API refuses.
 */
function WorkingOnCard({ ticket, compact, onMove, onNoteAdded }) {
  const detail = useApiData(getAssignedTicket, { ticketId: ticket.ticket_id })
  // The move being asked about, or 'note' for the note dialog.
  const [asking, setAsking] = useState(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const moves = engineerMoves(ticket.status)

  const close = () => {
    setAsking(null)
    setError('')
  }
  const send = async (text) => {
    setSending(true)
    setError('')
    try {
      if (asking === 'note') {
        await addAssignedTicketNote(ticket.ticket_id, text)
        onNoteAdded(ticket)
      } else {
        await onMove(ticket, asking.to, text)
      }
      setAsking(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSending(false)
    }
  }

  const buttonSx = compact ? { height: 44, fontSize: 14 } : { height: 34, px: 1.75, fontSize: 13 }
  const iconSx = { '& .MuiButton-startIcon > svg': { fontSize: 16 } }
  const noteLabel = compact ? 'Add note for requester' : 'Add note'

  return (
    <Card
      component="section"
      aria-labelledby="working-title"
      sx={{
        flex: 'none',
        border: 2,
        borderColor: 'primary.main',
        px: compact ? 1.5 : 2,
        py: compact ? 1.5 : 1.75,
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 1 : 1.25,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography
          id="working-title"
          component="h2"
          sx={{ m: 0, display: 'flex', alignItems: 'center', gap: 0.5, fontSize: 12, fontWeight: 600, color: 'primary.main', letterSpacing: '.02em' }}
        >
          <BuildIcon aria-hidden="true" sx={{ fontSize: 16 }} />
          WORKING ON NOW
        </Typography>
        <Typography
          component="span"
          title={formatDateTime(ticket.updated_at)}
          sx={{ ml: 'auto', fontSize: 12, color: 'text.secondary' }}
        >
          updated {ago(ticket.updated_at)}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.375 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 13 }}>
          <Box component="span" sx={{ fontWeight: 600, color: 'primary.main' }}>
            #{ticket.ticket_id}
          </Box>
          <PriorityPill priority={ticket.priority} />
          <StatusPill status={ticket.status} />
          {ticket.escalation_requested && <EscalatedMark />}
        </Box>
        <Link
          component={RouterLink}
          to={ticketPath(ticket)}
          underline="hover"
          sx={{ fontSize: compact ? 16 : 17, fontWeight: 600, color: 'secondary.main', ...clampLines(2) }}
        >
          {ticket.title}
        </Link>
        <Typography sx={{ fontSize: compact ? 13 : 12, color: 'text.secondary' }}>
          {formatLocation(ticket)} · reported by {ticket.created_by_name}
        </Typography>
      </Box>

      {!compact && !detail.error && (
        detail.data ? (
          <Typography component="p" sx={{ m: 0, fontSize: 14, lineHeight: 1.45, color: 'rgba(0,0,0,.8)', ...clampLines(3) }}>
            {detail.data.description}
          </Typography>
        ) : (
          <Skeleton variant="rounded" height={40} aria-label="Loading the description" />
        )
      )}

      <Box
        sx={
          compact
            ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }
            : { display: 'flex', flexWrap: 'wrap', gap: 1 }
        }
      >
        {moves.map((move, index) => {
          const Icon = MOVE_ICONS[move.to]
          return (
            <Button
              key={move.to}
              variant={index === 0 ? 'contained' : 'outlined'}
              startIcon={!compact && Icon ? <Icon /> : null}
              onClick={() => setAsking(move)}
              sx={{ ...buttonSx, ...iconSx }}
            >
              {move.label}
            </Button>
          )
        })}
        <Button
          startIcon={<ChatBubbleOutlineIcon />}
          onClick={() => setAsking('note')}
          sx={{ ...buttonSx, ...iconSx, px: compact ? undefined : 1.25, gridColumn: '1 / -1' }}
        >
          {noteLabel}
        </Button>
      </Box>

      {asking && (
        <ReasonDialog
          title={asking === 'note' ? 'Add note' : asking.reason.title}
          label={asking === 'note' ? 'Your note' : asking.reason.label}
          hint={asking === 'note' ? 'The requester sees it on the ticket.' : asking.reason.hint}
          sending={sending}
          error={error}
          onCancel={close}
          onConfirm={send}
        />
      )}
    </Card>
  )
}

WorkingOnCard.propTypes = {
  ticket: ticketShape.isRequired,
  compact: PropTypes.bool.isRequired,
  onMove: PropTypes.func.isRequired,
  onNoteAdded: PropTypes.func.isRequired,
}

/**
 * Start work on a ticket. The first one in "Up next" is the filled button. On phones
 * it's a round play button. `onStart` shows its own errors.
 */
function StartButton({ ticket, primary, compact, onStart }) {
  const [starting, setStarting] = useState(false)
  const start = async () => {
    setStarting(true)
    try {
      await onStart(ticket)
    } finally {
      setStarting(false)
    }
  }
  const label = `Start work on #${ticket.ticket_id}`
  const colors = primary
    ? { bgcolor: 'primary.main', color: 'common.white', '&:hover': { bgcolor: 'secondary.main' } }
    : { border: '1px solid rgba(5,109,174,.5)', color: 'primary.main' }
  const busy = <CircularProgress size={16} color="inherit" />

  if (compact) {
    return (
      <IconButton
        aria-label={label}
        onClick={start}
        disabled={starting}
        sx={{ width: 44, height: 44, flex: 'none', ...colors }}
      >
        {starting ? busy : <PlayArrowIcon sx={{ fontSize: 22 }} />}
      </IconButton>
    )
  }
  return (
    <Button
      aria-label={label}
      variant={primary ? 'contained' : 'outlined'}
      onClick={start}
      disabled={starting}
      startIcon={starting ? busy : <PlayArrowIcon />}
      sx={{ height: 30, px: 1.5, fontSize: 13, minWidth: 0, '& .MuiButton-startIcon': { mr: 0.5 } }}
    >
      Start
    </Button>
  )
}

StartButton.propTypes = {
  ticket: ticketShape.isRequired,
  primary: PropTypes.bool.isRequired,
  compact: PropTypes.bool.isRequired,
  onStart: PropTypes.func.isRequired,
}

/** "Up next": the Open tickets in triage order (P1 first, then oldest), each ready to start. */
function UpNext({ tickets, compact, onStart }) {
  const empty = (
    <Typography sx={{ px: compact ? 0 : 2, py: compact ? 0 : 2, fontSize: 13, color: 'text.secondary', borderTop: compact ? 0 : '1px solid rgba(0,0,0,.08)' }}>
      Nothing waiting. Nice work.
    </Typography>
  )

  if (compact) {
    return (
      <Box component="section" aria-labelledby="up-next-title" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography id="up-next-title" component="h2" sx={panelHeadingSx}>
          Up next
        </Typography>
        {tickets.length === 0 ? empty : (
          <Stack component="ol" spacing={1} sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {tickets.map((t, index) => (
              <Card component="li" key={t.ticket_id} sx={{ px: 1.5, py: 1.25, display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.375 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 12 }}>
                    <PriorityPill priority={t.priority} />
                    <Box component="span" sx={{ fontWeight: 600, color: 'primary.main' }}>
                      #{t.ticket_id}
                    </Box>
                    <Box component="span" sx={{ color: 'text.secondary' }}>
                      {formatAge(t.created_at)}
                    </Box>
                    {t.escalation_requested && <EscalatedMark />}
                  </Box>
                  <Link component={RouterLink} to={ticketPath(t)} underline="hover" color="inherit" sx={{ fontSize: 14, fontWeight: 500 }}>
                    {t.title}
                  </Link>
                </Box>
                <StartButton ticket={t} primary={index === 0} compact onStart={onStart} />
              </Card>
            ))}
          </Stack>
        )}
      </Box>
    )
  }

  return (
    <Card
      component="section"
      aria-labelledby="up-next-title"
      sx={{ flex: { lg: 1 }, minHeight: 0, maxHeight: { xs: 360, lg: 'none' }, display: 'flex', flexDirection: 'column' }}
    >
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, px: 2, pt: 1.5, pb: 1 }}>
        <Typography id="up-next-title" component="h2" sx={panelHeadingSx}>
          Up next
        </Typography>
        <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary' }}>
          {tickets.length} to start · P1 first, then oldest
        </Typography>
      </Box>
      {tickets.length === 0 ? empty : (
        <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, flex: 1, minHeight: 0, ...SCROLL_SX }}>
          {tickets.map((t, index) => (
            <Box
              component="li"
              key={t.ticket_id}
              sx={{
                display: 'grid',
                gridTemplateColumns: '20px minmax(0,1fr) auto',
                gap: 1.25,
                alignItems: 'center',
                px: 2,
                py: 1.25,
                borderTop: '1px solid rgba(0,0,0,.08)',
              }}
            >
              <Box component="span" aria-hidden="true" sx={{ fontSize: 12, fontWeight: 600, color: 'rgba(0,0,0,.45)' }}>
                {index + 1}
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 13, minWidth: 0 }}>
                  <PriorityPill priority={t.priority} />
                  <Link component={RouterLink} to={ticketPath(t)} underline="hover" sx={{ fontWeight: 600, flex: 'none' }}>
                    #{t.ticket_id}
                  </Link>
                  <Box component="span" sx={ellipsis} title={t.title}>
                    {t.title}
                  </Box>
                  {t.escalation_requested && <EscalatedMark />}
                </Box>
                <Box sx={{ ...ellipsis, fontSize: 12, color: 'text.secondary' }}>
                  {formatLocation(t)} · {formatAge(t.created_at)} old
                </Box>
              </Box>
              <StartButton ticket={t} primary={index === 0} compact={false} onStart={onStart} />
            </Box>
          ))}
        </Box>
      )}
    </Card>
  )
}

UpNext.propTypes = {
  tickets: PropTypes.arrayOf(ticketShape).isRequired,
  compact: PropTypes.bool.isRequired,
  onStart: PropTypes.func.isRequired,
}

// Column widths from the mockup, widened a little for this app's longer category names.
const COLUMNS = [
  ['#', 72],
  ['Title · location', undefined],
  ['Category', 150],
  ['Priority', 76],
  ['Status', 120],
  ['Age', 64],
]

/** Larger screens: a dense table whose body scrolls under a sticky header. */
function TicketTable({ tickets, currentId }) {
  const navigate = useNavigate()
  // The # link handles the keyboard; a click anywhere else on the row opens the ticket too.
  const openRow = (ticket) => (event) => {
    if (!event.target.closest('a')) navigate(ticketPath(ticket))
  }

  return (
    <TableContainer sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      <Table size="small" stickyHeader aria-label="My tickets" sx={{ tableLayout: 'fixed', minWidth: 720 }}>
        <TableHead>
          <TableRow>
            {COLUMNS.map(([name, width]) => (
              <TableCell
                key={name}
                align={name === 'Age' ? 'right' : 'left'}
                sx={{
                  width,
                  py: 0.75,
                  bgcolor: brand.page,
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'text.secondary',
                  borderTop: 1,
                  borderColor: 'divider',
                }}
              >
                {name}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {tickets.map((t) => (
            <TableRow
              key={t.ticket_id}
              hover
              onClick={openRow(t)}
              aria-current={t.ticket_id === currentId ? 'true' : undefined}
              sx={{
                cursor: 'pointer',
                bgcolor: t.ticket_id === currentId ? '#F0F7FC' : undefined,
                '&.MuiTableRow-hover:hover': { bgcolor: '#F0F7FC' },
                '& td': { fontSize: 13, py: 0.5 },
              }}
            >
              <TableCell>
                <Link component={RouterLink} to={ticketPath(t)} underline="hover" sx={{ fontWeight: 600 }}>
                  #{t.ticket_id}
                </Link>
              </TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                  <Box component="span" sx={ellipsis}>
                    {t.title}
                  </Box>
                  {t.escalation_requested && <EscalatedMark />}
                </Box>
                <Box sx={{ ...ellipsis, fontSize: 12, color: 'text.secondary' }}>{formatLocation(t)}</Box>
              </TableCell>
              <TableCell sx={{ ...ellipsis, color: 'rgba(0,0,0,.7)' }}>{CATEGORIES[t.category]}</TableCell>
              <TableCell>
                <PriorityPill priority={t.priority} />
              </TableCell>
              <TableCell>
                <StatusPill status={t.status} />
              </TableCell>
              <TableCell
                align="right"
                title={`Reported ${formatDateTime(t.created_at)}`}
                sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}
              >
                {formatAge(t.created_at)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

TicketTable.propTypes = {
  tickets: PropTypes.arrayOf(ticketShape).isRequired,
  currentId: PropTypes.number,
}

/** Phones: one card per ticket, each a single link to it. */
function TicketCards({ tickets }) {
  return (
    <Stack component="ul" spacing={1} sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {tickets.map((t) => (
        <Card component="li" key={t.ticket_id}>
          <CardActionArea component={RouterLink} to={ticketPath(t)} sx={{ px: 1.5, py: 1.25 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 12, mb: 0.5 }}>
              <Box component="span" sx={{ fontWeight: 600, color: 'primary.main' }}>
                #{t.ticket_id}
              </Box>
              <PriorityPill priority={t.priority} />
              <StatusPill status={t.status} />
              {t.escalation_requested && <EscalatedMark />}
              <Box component="span" sx={{ ml: 'auto', color: 'text.secondary' }}>
                {formatAge(t.created_at)}
              </Box>
            </Box>
            <Box sx={{ fontSize: 14, fontWeight: 500 }}>{t.title}</Box>
            <Box sx={{ fontSize: 12, color: 'text.secondary' }}>{formatLocation(t)}</Box>
          </CardActionArea>
        </Card>
      ))}
    </Stack>
  )
}

TicketCards.propTypes = {
  tickets: PropTypes.arrayOf(ticketShape).isRequired,
}

/**
 * The filtered list's loading, error and no-match states, then the list itself. Old rows
 * stay visible under a progress bar while new filters load.
 */
function ListBody({ list, currentId, filtersActive, onClearFilters, compact }) {
  if (list.error) {
    return (
      <Box sx={{ px: compact ? 0 : 2, pb: 2 }}>
        <ErrorState message={list.error.message} onRetry={list.reload} />
      </Box>
    )
  }
  if (list.loading && list.tickets.length === 0) {
    return (
      <Box sx={{ px: compact ? 0 : 2, pb: 2 }}>
        <Skeleton variant="rounded" height={160} aria-label="Loading tickets" />
      </Box>
    )
  }
  if (list.tickets.length === 0) {
    return (
      <Box sx={{ px: 2, py: 4, textAlign: 'center', fontSize: 14, color: 'text.secondary' }}>
        {filtersActive ? 'No tickets match these filters.' : 'No tickets are assigned to you right now.'}
        {filtersActive && (
          <Button size="small" onClick={onClearFilters} sx={{ ml: 0.5 }}>
            Clear filters
          </Button>
        )}
      </Box>
    )
  }
  return (
    <Box aria-busy={list.loading} sx={{ position: 'relative', flex: { lg: 1 }, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {list.loading && (
        <LinearProgress aria-label="Updating tickets" sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3 }} />
      )}
      {compact ? <TicketCards tickets={list.tickets} /> : <TicketTable tickets={list.tickets} currentId={currentId} />}
    </Box>
  )
}

ListBody.propTypes = {
  list: listShape.isRequired,
  currentId: PropTypes.number,
  filtersActive: PropTypes.bool.isRequired,
  onClearFilters: PropTypes.func.isRequired,
  compact: PropTypes.bool.isRequired,
}

/** Active / All, as the mockup's small outlined switch. Neither is lit while a count or status filters. */
function ViewSwitch({ filters, onChange, compact }) {
  return (
    <ToggleButtonGroup
      value={filters.tile || filters.status ? null : filters.view}
      exclusive
      size="small"
      aria-label="Which tickets"
      onChange={(event, view) =>
        view &&
        onChange({
          ...filters,
          view,
          tile: '',
          // A status filter replaces the view, so picking a view drops it; a count tile's
          // priority goes with the tile.
          status: '',
          priority: filters.tile ? '' : filters.priority,
        })
      }
      sx={{
        ml: compact ? 0 : 'auto',
        '& .MuiToggleButton-root': {
          minWidth: compact ? 56 : 0,
          height: compact ? 36 : 28,
          px: 1.5,
          fontSize: 13,
          fontWeight: 600,
          color: 'primary.main',
          borderColor: 'rgba(5,109,174,.5)',
        },
        '& .MuiToggleButton-root.Mui-selected': { bgcolor: 'rgba(5,109,174,.1)', color: 'primary.main' },
      }}
    >
      <ToggleButton value="active">Active</ToggleButton>
      <ToggleButton value="all">All</ToggleButton>
    </ToggleButtonGroup>
  )
}

ViewSwitch.propTypes = {
  filters: filtersShape.isRequired,
  onChange: PropTypes.func.isRequired,
  compact: PropTypes.bool.isRequired,
}

/** Search by ticket #, title or requester. */
function SearchField({ value, onChange, compact }) {
  return (
    <TextField
      type="search"
      size="small"
      placeholder="Search # or title"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      sx={compact ? { width: '100%' } : { width: 260, ...FIELD_SX }}
      slotProps={{
        htmlInput: { 'aria-label': 'Search' },
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon aria-hidden="true" sx={{ fontSize: 18 }} />
            </InputAdornment>
          ),
        },
      }}
    />
  )
}

SearchField.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  compact: PropTypes.bool.isRequired,
}

/**
 * A dropdown that reads "Status ▾" like the mockup, with no floating label; the name is
 * for screen readers. Once chosen it reads e.g. "Priority: P1".
 * `options` are [value, menu text, short text for the closed box].
 */
function CompactSelect({ label, allLabel, value, options, onChange, compact }) {
  const shortText = Object.fromEntries(options.map(([code, text, short]) => [code, short ?? text]))
  return (
    <TextField
      select
      size="small"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      sx={{
        ...(compact ? { width: '100%' } : { minWidth: 130, maxWidth: 220, ...FIELD_SX }),
        '& .MuiSelect-select': { color: value ? 'text.primary' : 'text.secondary' },
      }}
      slotProps={{
        select: {
          displayEmpty: true,
          renderValue: (chosen) => (chosen ? `${label}: ${shortText[chosen]}` : label),
          SelectDisplayProps: { 'aria-label': label },
        },
      }}
    >
      <MenuItem value="">{allLabel}</MenuItem>
      {options.map(([code, text]) => (
        <MenuItem key={code} value={code}>
          {text}
        </MenuItem>
      ))}
    </TextField>
  )
}

CompactSelect.propTypes = {
  label: PropTypes.string.isRequired,
  allLabel: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  options: PropTypes.arrayOf(PropTypes.arrayOf(PropTypes.string)).isRequired,
  onChange: PropTypes.func.isRequired,
  compact: PropTypes.bool.isRequired,
}

/** Search plus Status, Priority and Building. Picking a status or priority lets go of a count tile. */
function FilterFields({ filters, onChange, buildings, compact }) {
  const pick = (name) => (value) => onChange({ ...filters, [name]: value, tile: name === 'building_id' ? filters.tile : '' })
  return (
    <>
      <SearchField value={filters.q} onChange={(q) => onChange({ ...filters, q })} compact={compact} />
      <CompactSelect
        label="Status"
        allLabel="All statuses"
        value={filters.status}
        options={Object.entries(STATUSES).map(([code, { label }]) => [code, label])}
        onChange={pick('status')}
        compact={compact}
      />
      <CompactSelect
        label="Priority"
        allLabel="All priorities"
        value={filters.priority}
        options={Object.entries(PRIORITIES).map(([code, { label, description }]) => [code, `${label} · ${description}`, label])}
        onChange={pick('priority')}
        compact={compact}
      />
      <CompactSelect
        label="Building"
        allLabel="All buildings"
        value={filters.building_id}
        options={buildings.map((b) => [String(b.building_id), b.building_name])}
        onChange={pick('building_id')}
        compact={compact}
      />
    </>
  )
}

FilterFields.propTypes = {
  filters: filtersShape.isRequired,
  onChange: PropTypes.func.isRequired,
  buildings: buildingsShape.isRequired,
  compact: PropTypes.bool.isRequired,
}

/**
 * "My tickets": heading, which tickets are shown, search and filters, then the list in
 * triage order. On large screens it fills its grid cell and the list scrolls inside it.
 * Phones show the filters behind a Filter button.
 */
function TicketsPanel({ filters, onChange, buildings, list, currentId, filtersActive, onClearFilters, compact }) {
  const [showFilters, setShowFilters] = useState(false)
  const tile = TILES.find((t) => t.key === filters.tile)
  const caption = tile ? `${list.tickets.length} shown` : 'In triage order'

  const tileChip = tile && (
    <ButtonBase
      onClick={() => onChange({ ...filters, tile: '', status: '', priority: '' })}
      aria-label={`Clear the ${tile.label} filter`}
      sx={{
        height: 24,
        pl: 1.25,
        pr: 0.75,
        gap: 0.5,
        borderRadius: 3,
        bgcolor: '#E6F0F8',
        color: 'secondary.main',
        fontSize: 12,
        fontWeight: 500,
        flex: 'none',
      }}
    >
      {tile.label}
      <CancelIcon aria-hidden="true" sx={{ fontSize: 16 }} />
    </ButtonBase>
  )
  const listBody = (
    <ListBody
      list={list}
      currentId={currentId}
      filtersActive={filtersActive}
      onClearFilters={onClearFilters}
      compact={compact}
    />
  )

  if (compact) {
    return (
      <Box component="section" aria-labelledby="my-tickets-title" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography id="my-tickets-title" component="h2" sx={panelHeadingSx}>
            All my tickets
          </Typography>
          {tileChip}
          <Button
            startIcon={<TuneIcon />}
            aria-expanded={showFilters}
            aria-controls="my-tickets-filters"
            onClick={() => setShowFilters((shown) => !shown)}
            sx={{ ml: 'auto', minHeight: 44, fontSize: 14 }}
          >
            Filter
          </Button>
        </Box>
        {showFilters && (
          <Stack id="my-tickets-filters" spacing={1}>
            <ViewSwitch filters={filters} onChange={onChange} compact />
            <FilterFields filters={filters} onChange={onChange} buildings={buildings} compact />
          </Stack>
        )}
        {listBody}
      </Box>
    )
  }

  return (
    <Card
      component="section"
      aria-labelledby="my-tickets-title"
      sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, pt: 1.5, pb: 1 }}>
        <Typography id="my-tickets-title" component="h2" sx={panelHeadingSx}>
          My tickets
        </Typography>
        <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary' }}>
          {caption}
        </Typography>
        {tileChip}
        <ViewSwitch filters={filters} onChange={onChange} compact={false} />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, px: 2, pt: 0.5, pb: 1.5 }}>
        <FilterFields filters={filters} onChange={onChange} buildings={buildings} compact={false} />
      </Box>
      {listBody}
    </Card>
  )
}

TicketsPanel.propTypes = {
  filters: filtersShape.isRequired,
  onChange: PropTypes.func.isRequired,
  buildings: buildingsShape.isRequired,
  list: listShape.isRequired,
  currentId: PropTypes.number,
  filtersActive: PropTypes.bool.isRequired,
  onClearFilters: PropTypes.func.isRequired,
  compact: PropTypes.bool.isRequired,
}

/**
 * Engineer home ("My queue"), in the same system as the admin and employee dashboards:
 * clickable counts, then every ticket assigned to them beside the one they're working on
 * (with its status moves right on it) and what's up next in triage order. On large
 * screens it fits one screen with no page scroll; phones stack it, current ticket first.
 */
function EngineerDashboardPage() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const summary = useApiData(listMyQueue, ACTIVE)
  const buildings = useApiData(listBuildings)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [notice, setNotice] = useState(null)
  const search = useDebouncedValue(filters.q.trim(), 300)
  // A status filter can be Closed, so it replaces the Active/All view rather than adding to it.
  const list = useApiData(listMyQueue, {
    view: filters.status || filters.view === 'all' ? undefined : 'active',
    q: search || undefined,
    status: filters.status || undefined,
    priority: filters.priority || undefined,
    building_id: filters.building_id || undefined,
  })
  const listTickets = list.data ?? []
  const firstName = user.full_name.split(' ')[0]
  const filtersActive = Object.keys(DEFAULT_FILTERS).some((key) =>
    key === 'q' ? filters.q.trim() !== '' : filters[key] !== DEFAULT_FILTERS[key],
  )
  const clearFilters = () => setFilters(DEFAULT_FILTERS)

  const pickTile = (key) =>
    setFilters((current) => {
      const cleared = { ...current, tile: '', status: '', priority: '' }
      return current.tile === key ? cleared : { ...cleared, view: 'active', tile: key, ...TILES.find((t) => t.key === key).filter }
    })
  const refresh = () => {
    summary.reload()
    list.reload()
  }
  const say = (text, severity = 'success') => setNotice({ text, severity, key: Date.now(), open: true })
  // Keeps the text while the toast fades out.
  const hideNotice = () => setNotice((shown) => ({ ...shown, open: false }))

  // Rejects if the API refuses, so the dialog that asked can show why.
  const move = async (ticket, to, reason = '') => {
    await changeTicketStatus(ticket.ticket_id, to, reason)
    refresh()
    say(MOVE_NOTICES[to](ticket.ticket_id))
  }
  const startWork = async (ticket) => {
    try {
      await move(ticket, 'in_progress')
    } catch (err) {
      say(errorMessage(err), 'error')
    }
  }
  const noteAdded = (ticket) => say(`Note added to #${ticket.ticket_id}.`)

  let content
  if (summary.error) {
    content = <ErrorState message={summary.error.message} onRetry={summary.reload} />
  } else if (!summary.data) {
    content = <SummarySkeleton />
  } else {
    const pick = pickCurrentTicket(summary.data)
    const current = pick?.kind === 'current' ? pick.ticket : null
    const upNext = summary.data.filter((t) => t.status === 'open')
    const tiles = <CountTiles counts={countTiles(summary.data)} tile={filters.tile} onPick={pickTile} compact={isMobile} />
    const working = <WorkingOnSection ticket={current} compact={isMobile} onMove={move} onNoteAdded={noteAdded} />
    const next = <UpNext tickets={upNext} compact={isMobile} onStart={startWork} />
    const panel = (
      <TicketsPanel
        filters={filters}
        onChange={setFilters}
        buildings={buildings.data ?? []}
        list={{
          // The P1 tile counts only unfinished P1s; the API's active view still has resolved ones.
          tickets: filters.tile === 'p1' ? listTickets.filter(isP1Active) : listTickets,
          loading: list.loading,
          error: list.error,
          reload: list.reload,
        }}
        currentId={current?.ticket_id}
        filtersActive={filtersActive}
        onClearFilters={clearFilters}
        compact={isMobile}
      />
    )

    content = isMobile ? (
      <>
        {tiles}
        {working}
        {next}
        {panel}
      </>
    ) : (
      <>
        {tiles}
        <Box
          sx={{
            flex: { lg: 1 },
            minHeight: 0,
            display: 'grid',
            gap: GAP,
            gridTemplateColumns: { xs: 'minmax(0,1fr)', lg: 'minmax(0,1fr) 420px' },
            gridTemplateRows: { lg: 'minmax(0,1fr)' },
          }}
        >
          {panel}
          {/* Below lg this column comes first, its two cards side by side from md up. */}
          <Box
            sx={{
              order: { xs: -1, lg: 0 },
              minHeight: 0,
              display: { xs: 'grid', lg: 'flex' },
              flexDirection: 'column',
              gap: GAP,
              gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'repeat(2, minmax(0,1fr))' },
              alignItems: { xs: 'start', lg: 'stretch' },
            }}
          >
            {working}
            {next}
          </Box>
        </Box>
      </>
    )
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: GAP,
        '@media (min-width: 1200px)': FILL_FRAME_SX,
      }}
    >
      <PageHeader firstName={firstName} compact={isMobile} />
      {content}
      <Snackbar
        key={notice?.key}
        open={Boolean(notice?.open)}
        autoHideDuration={4000}
        onClose={(event, reason) => reason !== 'clickaway' && hideNotice()}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {notice && (
          <Alert variant="filled" severity={notice.severity} onClose={hideNotice}>
            {notice.text}
          </Alert>
        )}
      </Snackbar>
    </Box>
  )
}

export default EngineerDashboardPage
