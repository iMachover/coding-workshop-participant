import { useState } from 'react'
import PropTypes from 'prop-types'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import InputAdornment from '@mui/material/InputAdornment'
import LinearProgress from '@mui/material/LinearProgress'
import Link from '@mui/material/Link'
import MenuItem from '@mui/material/MenuItem'
import Skeleton from '@mui/material/Skeleton'
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
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import BlockIcon from '@mui/icons-material/Block'
import CancelIcon from '@mui/icons-material/Cancel'
import CheckIcon from '@mui/icons-material/Check'
import DoneAllIcon from '@mui/icons-material/DoneAll'
import EngineeringIcon from '@mui/icons-material/Engineering'
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
import PauseIcon from '@mui/icons-material/Pause'
import SearchIcon from '@mui/icons-material/Search'
import TaskAltIcon from '@mui/icons-material/TaskAlt'
import { Link as RouterLink, useNavigate } from 'react-router'

import useAuth from '../auth/useAuth'
import { panelHeadingSx, visuallyHiddenSx } from '../components/admin/panelStyles'
import { StatusPill } from '../components/admin/TicketPills'
import ErrorState from '../components/ErrorState'
import ReasonDialog from '../components/tickets/ReasonDialog'
import useApiData from '../hooks/useApiData'
import useDebouncedValue from '../hooks/useDebouncedValue'
import useIsMobile from '../hooks/useIsMobile'
import useMyTickets from '../hooks/useMyTickets'
import { ApiError } from '../services/apiClient'
import { addNote, getMyTicket, listNotes } from '../services/ticketService'
import { brand } from '../theme'
import {
  CATEGORIES,
  formatAge,
  formatDateTime,
  formatLocation,
  ROLES,
  SCOPES,
  STATUSES,
} from '../utils/ticketFormat'
import { workflowState } from '../utils/ticketWorkflow'

// AppLayout gives this page its full-screen frame: on large screens the frame is the window
// below the header, so the page fills it and nothing scrolls but the panels.
const FILL_FRAME_SX = { height: '100%' }
// Phones: the screen less the 48px header and the layout's 16px padding above and below.
const PHONE_MIN_HEIGHT = 'calc(100dvh - 80px)'
const GAP = 1.5
const MUTED = 'rgba(0,0,0,.15)'
const BLOCKED = STATUSES.blocked.dot
const BLOCKED_TEXT = '#B3261E'

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

// Search and Status: 34px tall with 13px text, as in the mockup.
const FIELD_SX = { '& .MuiInputBase-root': { height: 34, fontSize: 13 } }

const ellipsis = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }

/** Cuts text off after `lines` lines with an ellipsis. */
const clampLines = (lines) => ({
  display: '-webkit-box',
  WebkitLineClamp: lines,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
})

const DEFAULT_FILTERS = { view: 'active', status: '', q: '' }

// The clickable count row. "Active" is everything not yet closed, like the API's
// view=active; the others filter the list to one status.
const TILES = [
  { key: 'active', label: 'Active', sub: 'not yet closed', dot: brand.blue },
  { key: 'open', label: STATUSES.open.label, sub: 'not started yet', dot: brand.sky },
  { key: 'in_progress', label: STATUSES.in_progress.label, sub: 'being fixed', dot: '#ED6C02' },
  { key: 'blocked', label: STATUSES.blocked.label, sub: 'waiting on something', dot: '#D32F2F' },
  { key: 'resolved', label: STATUSES.resolved.label, sub: 'fixed, pending close', dot: '#2E7D32' },
]

// Read by screen readers after each step's name, e.g. "Open (current status)".
const STATE_TEXT = {
  done: 'done',
  current: 'current status',
  paused: 'paused while blocked',
  upcoming: 'not reached yet',
}

// How each ticket reads in "Recent updates": its current state in plain words.
const UPDATES = {
  open: { text: "was received. Work hasn't started yet.", Icon: InboxOutlinedIcon, bg: '#E6F0F8', fg: brand.blue },
  in_progress: { text: 'is being worked on.', Icon: EngineeringIcon, bg: '#FFF3E0', fg: '#8A4B00' },
  blocked: { text: 'is blocked, waiting on something.', Icon: BlockIcon, bg: '#FDECEA', fg: BLOCKED_TEXT },
  resolved: { text: 'was resolved. Still broken? Add a note.', Icon: TaskAltIcon, bg: '#E8F5E9', fg: '#2E7D32' },
  closed: { text: 'was closed.', Icon: DoneAllIcon, bg: '#EEEEEE', fg: '#424242' },
}
const UPDATE_LIMIT = 10

const ticketShape = PropTypes.shape({
  ticket_id: PropTypes.number.isRequired,
  title: PropTypes.string.isRequired,
  category: PropTypes.oneOf(Object.keys(CATEGORIES)).isRequired,
  status: PropTypes.oneOf(Object.keys(STATUSES)).isRequired,
  affected_scope: PropTypes.oneOf(Object.keys(SCOPES)).isRequired,
  building_name: PropTypes.string.isRequired,
  floor_number: PropTypes.number,
  seat_number: PropTypes.string,
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
  status: PropTypes.string.isRequired,
  q: PropTypes.string.isRequired,
})

const ticketPath = (ticket) => `/tickets/${ticket.ticket_id}`

/**
 * The count row's numbers and the most recently updated ticket that isn't closed,
 * in one pass over the employee's tickets.
 * @param {Array<{status: string, updated_at: string}>} tickets
 */
function summarize(tickets) {
  const counts = { active: 0, open: 0, in_progress: 0, blocked: 0, resolved: 0 }
  let latest = null
  for (const ticket of tickets) {
    if (ticket.status === 'closed') continue
    counts.active += 1
    counts[ticket.status] += 1
    if (!latest || Date.parse(ticket.updated_at) > Date.parse(latest.updated_at)) latest = ticket
  }
  return { counts, latest }
}

/** "20 min ago", "3 h ago", or "just now". */
function ago(iso) {
  const age = formatAge(iso)
  return age === 'just now' ? age : `${age} ago`
}

/** The dashboard's main action. `pinned` is the full-width phone version. */
function CreateTicketButton({ pinned = false }) {
  return (
    <Button
      component={RouterLink}
      to="/tickets/new"
      variant="contained"
      startIcon={<AddIcon />}
      fullWidth={pinned}
      sx={pinned ? { height: 48, fontSize: 15 } : { flex: 'none', height: 38, px: 2.25 }}
    >
      Create New Ticket
    </Button>
  )
}

CreateTicketButton.propTypes = {
  pinned: PropTypes.bool,
}

/** Title and greeting; on larger screens the Create button sits at the right. */
function PageHeader({ firstName, compact }) {
  return (
    <Box
      sx={{
        flex: 'none',
        display: 'flex',
        flexDirection: compact ? 'column' : 'row',
        alignItems: compact ? 'flex-start' : 'center',
        columnGap: 1.5,
      }}
    >
      <Typography variant="h4" component="h1" sx={{ fontSize: compact ? 20 : 22, whiteSpace: 'nowrap' }}>
        My dashboard
      </Typography>
      <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Welcome back, {firstName}.</Typography>
      {!compact && (
        <Box sx={{ ml: 'auto' }}>
          <CreateTicketButton />
        </Box>
      )}
    </Box>
  )
}

PageHeader.propTypes = {
  firstName: PropTypes.string.isRequired,
  compact: PropTypes.bool.isRequired,
}

/**
 * Phones: the Create button sits at the bottom of the screen. The page is at least one
 * screen tall (PHONE_MIN_HEIGHT) and `mt: auto` pushes the bar down on short pages; on
 * long ones it sticks to the bottom while the page scrolls.
 */
function PinnedCreateBar() {
  return (
    <Box
      sx={{
        position: 'sticky',
        bottom: 0,
        zIndex: 2,
        mt: 'auto',
        mx: -2,
        mb: -2,
        px: 2,
        py: 1.25,
        bgcolor: 'background.paper',
        borderTop: 1,
        borderColor: 'divider',
      }}
    >
      <CreateTicketButton pinned />
    </Box>
  )
}

function SummarySkeleton() {
  return (
    <Stack spacing={GAP} aria-label="Loading your tickets" aria-busy="true">
      <Skeleton variant="rounded" height={64} />
      <Skeleton variant="rounded" height={320} />
    </Stack>
  )
}

/** A brand-new employee with no tickets yet. */
function NoTicketsYet() {
  return (
    <Card>
      <CardContent sx={{ textAlign: 'center', py: 6 }}>
        <Typography component="h2" variant="h5" gutterBottom>
          You haven&apos;t reported any issues yet
        </Typography>
        <Typography color="text.secondary">
          When something in the office needs fixing, create a ticket and track it here.
        </Typography>
      </CardContent>
    </Card>
  )
}

/**
 * The clickable count row. A status count filters the list to that status (click again
 * to clear); "Active" goes back to all active tickets. Phones scroll the row sideways.
 */
function CountTiles({ counts, status, onPick, compact }) {
  return (
    <Box
      component="ul"
      aria-label="My tickets in numbers"
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
      {TILES.map((tile) => {
        const pressed = tile.key === status
        const dot = (
          <Box
            component="span"
            aria-hidden="true"
            sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: tile.dot, flex: 'none' }}
          />
        )
        return (
          <Box component="li" key={tile.key} sx={{ display: 'flex', flex: compact ? 'none' : undefined }}>
            <ButtonBase
              onClick={() => onPick(tile.key)}
              aria-pressed={tile.key === 'active' ? undefined : pressed}
              sx={{
                flex: 1,
                minWidth: compact ? 96 : 0,
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
                    {counts[tile.key]}
                  </Box>
                  <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.625, fontSize: 12, color: 'rgba(0,0,0,.65)', whiteSpace: 'nowrap' }}>
                    {dot}
                    {tile.label}
                  </Box>
                </>
              ) : (
                <>
                  <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 12, fontWeight: 500, color: 'text.secondary' }}>
                    {dot}
                    {tile.label}
                  </Box>
                  <Box component="span" sx={{ display: 'flex', alignItems: 'baseline', gap: 1, minWidth: 0 }}>
                    <Box component="span" sx={{ fontSize: 26, fontWeight: 600, color: 'secondary.main', lineHeight: 1.1 }}>
                      {counts[tile.key]}
                    </Box>
                    <Box component="span" sx={{ ...ellipsis, fontSize: 12, color: 'text.secondary' }}>
                      {tile.sub}
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
  status: PropTypes.string.isRequired,
  onPick: PropTypes.func.isRequired,
  compact: PropTypes.bool.isRequired,
}

/** One workflow circle: a check when done, dots when current, a pause while blocked. */
function StepDot({ state }) {
  const filled = state !== 'upcoming'
  const Icon = { done: CheckIcon, current: MoreHorizIcon, paused: PauseIcon }[state]
  return (
    <Box
      aria-hidden="true"
      sx={{
        position: 'relative',
        zIndex: 1,
        width: 20,
        height: 20,
        boxSizing: 'border-box',
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        color: 'common.white',
        bgcolor: { paused: BLOCKED, upcoming: 'background.paper' }[state] ?? 'primary.main',
        border: filled ? 'none' : '1px solid rgba(0,0,0,.26)',
      }}
    >
      {Icon && <Icon sx={{ fontSize: 13 }} />}
    </Box>
  )
}

StepDot.propTypes = {
  state: PropTypes.oneOf(Object.keys(STATE_TEXT)).isRequired,
}

/** "Blocked: waiting on a vendor part", right under the progress when work is paused. */
function BlockedLine({ reason }) {
  return (
    <Typography component="p" sx={{ m: 0, fontSize: 12, ...ellipsis }} title={reason ?? undefined}>
      <Box component="span" sx={{ fontWeight: 600, color: BLOCKED_TEXT }}>
        Blocked
      </Box>
      {reason && `: ${reason}`}
    </Typography>
  )
}

BlockedLine.propTypes = {
  reason: PropTypes.string,
}

/**
 * Where the ticket is: Open -> In Progress -> Resolved -> Closed, with no dates. Blocked
 * is a pause on "In Progress", not a step. Circles with labels, or plain bars on phones.
 */
function WorkflowProgress({ status, blockedReason = null, compact }) {
  const { steps, blocked } = workflowState(status)
  return (
    <>
      <Box
        component="ol"
        aria-label="Ticket workflow"
        sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', gap: compact ? 0.5 : 0 }}
      >
        {steps.map((step, index) => {
          const last = index === steps.length - 1
          const reached = step.state !== 'upcoming'
          const current = step.state === 'current' || step.state === 'paused'
          const label = (
            <>
              {STATUSES[step.status].label}
              <Box component="span" sx={visuallyHiddenSx}>
                {` (${STATE_TEXT[step.state]})`}
              </Box>
            </>
          )
          if (compact) {
            return (
              <Box
                component="li"
                key={step.status}
                aria-current={current ? 'step' : undefined}
                sx={{
                  flex: 1,
                  height: 4,
                  borderRadius: 2,
                  bgcolor: { upcoming: 'rgba(0,0,0,.12)', paused: BLOCKED }[step.state] ?? 'primary.main',
                }}
              >
                <Box component="span" sx={visuallyHiddenSx}>
                  {label}
                </Box>
              </Box>
            )
          }
          return (
            <Box
              component="li"
              key={step.status}
              aria-current={current ? 'step' : undefined}
              sx={{
                flex: 1,
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 0.5,
                // The line to the next circle, blue once the next step is reached.
                '&::after': !last && {
                  content: '""',
                  position: 'absolute',
                  top: 9,
                  left: '50%',
                  right: '-50%',
                  height: 2,
                  bgcolor: steps[index + 1].state !== 'upcoming' ? 'primary.main' : MUTED,
                },
              }}
            >
              <StepDot state={step.state} />
              <Typography
                component="span"
                sx={{
                  fontSize: 11,
                  textAlign: 'center',
                  fontWeight: current ? 700 : 400,
                  color: reached ? 'secondary.main' : 'text.secondary',
                }}
              >
                {label}
              </Typography>
            </Box>
          )
        })}
      </Box>
      {blocked && <BlockedLine reason={blockedReason} />}
    </>
  )
}

WorkflowProgress.propTypes = {
  status: PropTypes.oneOf(Object.keys(STATUSES)).isRequired,
  blockedReason: PropTypes.string,
  compact: PropTypes.bool.isRequired,
}

/** The newest note on the ticket, e.g. the engineer's latest update. */
function LatestNote({ notes, userId, compact }) {
  if (notes.error) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 13, color: 'text.secondary' }}>
        Couldn&apos;t load the latest note.
        <Button size="small" onClick={notes.reload}>
          Try again
        </Button>
      </Box>
    )
  }
  if (!notes.data) return <Skeleton variant="rounded" height={compact ? 36 : 64} aria-label="Loading the latest note" />
  if (notes.data.length === 0) {
    return (
      <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
        No notes yet. Updates from the engineer will show up here.
      </Typography>
    )
  }

  const note = notes.data.at(-1)
  const author = note.user_id === userId ? 'You' : note.author_name
  if (compact) {
    return (
      <Typography sx={{ fontSize: 13, lineHeight: 1.4, color: 'rgba(0,0,0,.75)', ...clampLines(2) }}>
        <b>{author}:</b> {note.note_text}
      </Typography>
    )
  }
  return (
    <Box
      component="figure"
      aria-label="Latest note"
      sx={{ m: 0, bgcolor: brand.page, borderRadius: 1.5, px: 1.5, py: 1.25, display: 'flex', flexDirection: 'column', gap: 0.5 }}
    >
      <Box component="figcaption" sx={{ fontSize: 12, color: 'text.secondary' }}>
        <Box component="b" sx={{ color: 'text.primary' }}>
          {author}
        </Box>
        {` · ${ROLES[note.author_role]} · `}
        <span title={formatDateTime(note.created_at)}>{ago(note.created_at)}</span>
      </Box>
      <Box component="blockquote" sx={{ m: 0, fontSize: 14, lineHeight: 1.45, ...clampLines(3) }}>
        {note.note_text}
      </Box>
    </Box>
  )
}

LatestNote.propTypes = {
  notes: PropTypes.shape({
    data: PropTypes.arrayOf(
      PropTypes.shape({
        user_id: PropTypes.number.isRequired,
        author_name: PropTypes.string.isRequired,
        author_role: PropTypes.oneOf(Object.keys(ROLES)).isRequired,
        note_text: PropTypes.string.isRequired,
        created_at: PropTypes.string.isRequired,
      }),
    ),
    error: PropTypes.instanceOf(Error),
    reload: PropTypes.func.isRequired,
  }).isRequired,
  userId: PropTypes.number.isRequired,
  compact: PropTypes.bool.isRequired,
}

/**
 * The most recently updated ticket that isn't closed: where it is in the workflow, who's
 * on it and the newest note, with a quick way to add one. With none, says so instead.
 */
function LatestTicketCard({ ticket, compact, onNoteAdded }) {
  if (!ticket) {
    return (
      <Card component="section" aria-labelledby="highlight-title" sx={{ flex: 'none', px: 2, py: 1.75 }}>
        <Typography id="highlight-title" component="h2" sx={panelHeadingSx}>
          No active tickets
        </Typography>
        <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5 }}>
          You&apos;re all caught up. Anything you report will show up here.
        </Typography>
      </Card>
    )
  }
  // Keyed by ticket so the note dialog and fetches start fresh for a different ticket.
  return <ActiveTicketCard key={ticket.ticket_id} ticket={ticket} compact={compact} onNoteAdded={onNoteAdded} />
}

LatestTicketCard.propTypes = {
  ticket: ticketShape,
  compact: PropTypes.bool.isRequired,
  onNoteAdded: PropTypes.func.isRequired,
}

function ActiveTicketCard({ ticket, compact, onNoteAdded }) {
  const { user } = useAuth()
  const params = { ticketId: ticket.ticket_id }
  const detail = useApiData(getMyTicket, params)
  const notes = useApiData(listNotes, params)
  const [noteOpen, setNoteOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')

  const sendNote = async (text) => {
    setSending(true)
    setSendError('')
    try {
      await addNote(ticket.ticket_id, text)
      setNoteOpen(false)
      notes.reload()
      onNoteAdded()
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const engineer = detail.data && (
    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
      {detail.data.assigned_to_name ? `Engineer: ${detail.data.assigned_to_name}` : 'Waiting for an engineer'}
    </Typography>
  )
  const buttonSx = compact ? { flex: 1, height: 44, fontSize: 14 } : { height: 34, px: 1.75, fontSize: 13 }
  const actions = [
    <Button key="view" component={RouterLink} to={ticketPath(ticket)} variant={compact ? 'outlined' : 'contained'} sx={buttonSx}>
      View ticket
    </Button>,
    <Button key="note" variant="outlined" onClick={() => setNoteOpen(true)} sx={buttonSx}>
      Add note
    </Button>,
  ]

  return (
    <Card
      component="section"
      aria-labelledby="highlight-title"
      sx={{ flex: 'none', px: compact ? 1.5 : 2, py: compact ? 1.5 : 1.75, display: 'flex', flexDirection: 'column', gap: compact ? 1 : 1.25 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography component="span" sx={{ fontSize: 12, fontWeight: 600, color: 'text.secondary', letterSpacing: '.02em' }}>
          MOST RECENT ACTIVE
        </Typography>
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
          {compact && (
            <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary' }}>
              {ago(ticket.updated_at)}
            </Typography>
          )}
          <StatusPill status={ticket.status} />
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
        <Typography id="highlight-title" component="h2" sx={{ m: 0, display: 'flex', flexDirection: 'column' }}>
          <Link component={RouterLink} to={ticketPath(ticket)} underline="hover" sx={{ fontSize: 13, fontWeight: 600 }}>
            #{ticket.ticket_id}
          </Link>{' '}
          <Box component="span" sx={{ fontSize: compact ? 15 : 16, fontWeight: 600, color: 'secondary.main', ...clampLines(2) }}>
            {ticket.title}
          </Box>
        </Typography>
        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
          {formatLocation(ticket)} · {SCOPES[ticket.affected_scope]}
        </Typography>
        {!compact && engineer}
      </Box>

      <WorkflowProgress status={ticket.status} blockedReason={detail.data?.blocked_reason} compact={compact} />
      <LatestNote notes={notes} userId={user.user_id} compact={compact} />
      <Box sx={{ display: 'flex', gap: 1 }}>{compact ? [...actions].reverse() : actions}</Box>

      {noteOpen && (
        <ReasonDialog
          title="Add note"
          label="Your note"
          hint="The engineer sees it on the ticket."
          sending={sending}
          error={sendError}
          onCancel={() => {
            setNoteOpen(false)
            setSendError('')
          }}
          onConfirm={sendNote}
        />
      )}
    </Card>
  )
}

ActiveTicketCard.propTypes = {
  ticket: ticketShape.isRequired,
  compact: PropTypes.bool.isRequired,
  onNoteAdded: PropTypes.func.isRequired,
}

/** The employee's most recently updated tickets and where each one stands now. */
function RecentUpdates({ tickets }) {
  return (
    <Card
      component="section"
      aria-labelledby="updates-title"
      sx={{ flex: { lg: 1 }, minHeight: 0, maxHeight: { xs: 320, lg: 'none' }, display: 'flex', flexDirection: 'column' }}
    >
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, px: 2, pt: 1.5, pb: 0.75 }}>
        <Typography id="updates-title" component="h2" sx={panelHeadingSx}>
          Recent updates
        </Typography>
        <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary' }}>
          on your tickets
        </Typography>
      </Box>
      <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, flex: 1, minHeight: 0, ...SCROLL_SX }}>
        {tickets.slice(0, UPDATE_LIMIT).map((t) => {
          const { text, Icon, bg, fg } = UPDATES[t.status]
          return (
            <Box
              component="li"
              key={t.ticket_id}
              sx={{
                display: 'grid',
                gridTemplateColumns: '28px minmax(0,1fr) auto',
                gap: 1.25,
                alignItems: 'start',
                px: 2,
                py: 1,
                borderTop: '1px solid rgba(0,0,0,.06)',
              }}
            >
              <Box
                aria-hidden="true"
                sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: bg, color: fg, display: 'grid', placeItems: 'center' }}
              >
                <Icon sx={{ fontSize: 16 }} />
              </Box>
              <Typography sx={{ fontSize: 13, lineHeight: 1.4, ...clampLines(2) }}>
                <Link component={RouterLink} to={ticketPath(t)} underline="hover" sx={{ fontWeight: 600 }}>
                  #{t.ticket_id}
                </Link>{' '}
                {t.title} {text}
              </Typography>
              <Typography
                component="span"
                title={formatDateTime(t.updated_at)}
                sx={{ fontSize: 12, color: 'rgba(0,0,0,.55)', whiteSpace: 'nowrap' }}
              >
                {formatAge(t.updated_at)}
              </Typography>
            </Box>
          )
        })}
      </Box>
    </Card>
  )
}

RecentUpdates.propTypes = {
  tickets: PropTypes.arrayOf(ticketShape).isRequired,
}

// Column widths from the mockup, with Impact and Category in place of urgency and engineer.
const COLUMNS = [
  ['#', 72],
  ['Title · location', undefined],
  ['Status', 120],
  ['Impact', 100],
  ['Category', 170],
  ['Updated', 80],
]

/** Larger screens: a dense table whose body scrolls under a sticky header. */
function TicketTable({ tickets }) {
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
                align={name === 'Updated' ? 'right' : 'left'}
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
              sx={{ cursor: 'pointer', '&.MuiTableRow-hover:hover': { bgcolor: '#F0F7FC' }, '& td': { fontSize: 13, py: 0.5 } }}
            >
              <TableCell>
                <Link component={RouterLink} to={ticketPath(t)} underline="hover" sx={{ fontWeight: 600 }}>
                  #{t.ticket_id}
                </Link>
              </TableCell>
              <TableCell>
                <Box sx={ellipsis}>{t.title}</Box>
                <Box sx={{ ...ellipsis, fontSize: 12, color: 'text.secondary' }}>{formatLocation(t)}</Box>
              </TableCell>
              <TableCell>
                <StatusPill status={t.status} />
              </TableCell>
              <TableCell sx={ellipsis}>{SCOPES[t.affected_scope]}</TableCell>
              <TableCell sx={{ ...ellipsis, color: 'text.secondary' }}>{CATEGORIES[t.category]}</TableCell>
              <TableCell
                align="right"
                title={formatDateTime(t.updated_at)}
                sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}
              >
                {formatAge(t.updated_at)}
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
              <StatusPill status={t.status} />
              <Box component="span" sx={{ ml: 'auto', color: 'text.secondary' }}>
                {formatAge(t.updated_at)}
              </Box>
            </Box>
            <Box sx={{ fontSize: 14, fontWeight: 500 }}>{t.title}</Box>
            <Box sx={{ fontSize: 12, color: 'text.secondary' }}>
              {formatLocation(t)} · {SCOPES[t.affected_scope]}
            </Box>
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
function ListBody({ list, filtersActive, onClearFilters, compact }) {
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
        No tickets match these filters.
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
      {compact ? <TicketCards tickets={list.tickets} /> : <TicketTable tickets={list.tickets} />}
    </Box>
  )
}

ListBody.propTypes = {
  list: listShape.isRequired,
  filtersActive: PropTypes.bool.isRequired,
  onClearFilters: PropTypes.func.isRequired,
  compact: PropTypes.bool.isRequired,
}

/** Active / All, as the mockup's small outlined switch. Neither is lit while a count filters. */
function ViewSwitch({ filters, onChange, compact }) {
  return (
    <ToggleButtonGroup
      value={filters.status ? null : filters.view}
      exclusive
      size="small"
      aria-label="Which tickets"
      onChange={(event, view) => view && onChange({ ...filters, view, status: '' })}
      sx={{
        ml: 'auto',
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

/** Search by ticket # or title. */
function SearchField({ value, onChange, fullWidth }) {
  return (
    <TextField
      type="search"
      size="small"
      placeholder="Search # or title"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      sx={{ width: fullWidth ? '100%' : 260, ...FIELD_SX }}
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
  fullWidth: PropTypes.bool,
}

/**
 * "My tickets": heading, which tickets are shown, search and status, then the list.
 * On large screens it fills its grid cell and the list scrolls inside it.
 */
function TicketsPanel({ filters, onChange, list, filtersActive, onClearFilters, compact }) {
  const statusLabel = filters.status && STATUSES[filters.status].label
  let caption = 'All tickets'
  if (filters.status) caption = `${list.tickets.length} shown`
  else if (filters.view === 'active') caption = 'Active and awaiting close'

  const heading = (
    <Typography id="my-tickets-title" component="h2" sx={panelHeadingSx}>
      My tickets
    </Typography>
  )
  const statusChip = filters.status && (
    <ButtonBase
      onClick={() => onChange({ ...filters, status: '' })}
      aria-label={`Clear the ${statusLabel} filter`}
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
      }}
    >
      {statusLabel}
      <CancelIcon aria-hidden="true" sx={{ fontSize: 16 }} />
    </ButtonBase>
  )

  if (compact) {
    return (
      <Box component="section" aria-labelledby="my-tickets-title" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pt: 0.5 }}>
          {heading}
          {statusChip}
          <ViewSwitch filters={filters} onChange={onChange} compact />
        </Box>
        <SearchField value={filters.q} onChange={(q) => onChange({ ...filters, q })} fullWidth />
        <ListBody list={list} filtersActive={filtersActive} onClearFilters={onClearFilters} compact />
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
        {heading}
        <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary' }}>
          {caption}
        </Typography>
        {statusChip}
        <ViewSwitch filters={filters} onChange={onChange} compact={false} />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, pt: 0.5, pb: 1.5 }}>
        <SearchField value={filters.q} onChange={(q) => onChange({ ...filters, q })} />
        {/* Reads "Status ▾" like the mockup, with no floating label; the name is for screen readers. */}
        <TextField
          select
          size="small"
          value={filters.status}
          onChange={(event) => onChange({ ...filters, status: event.target.value })}
          sx={{ minWidth: 150, ...FIELD_SX, '& .MuiSelect-select': { color: filters.status ? 'text.primary' : 'text.secondary' } }}
          slotProps={{
            select: {
              displayEmpty: true,
              renderValue: (value) => (value ? `Status: ${STATUSES[value].label}` : 'Status'),
              SelectDisplayProps: { 'aria-label': 'Status' },
            },
          }}
        >
          <MenuItem value="">All statuses</MenuItem>
          {Object.entries(STATUSES).map(([code, { label }]) => (
            <MenuItem key={code} value={code}>
              {label}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      <ListBody list={list} filtersActive={filtersActive} onClearFilters={onClearFilters} compact={false} />
    </Card>
  )
}

TicketsPanel.propTypes = {
  filters: filtersShape.isRequired,
  onChange: PropTypes.func.isRequired,
  list: listShape.isRequired,
  filtersActive: PropTypes.bool.isRequired,
  onClearFilters: PropTypes.func.isRequired,
  compact: PropTypes.bool.isRequired,
}

/**
 * Employee home, in the same system as the admin dashboard: clickable counts, the
 * employee's tickets beside their most recent active ticket and a feed of recent updates.
 * On large screens it fits one screen with no page scroll; phones stack it, with the
 * Create button pinned to the bottom. Employees never see priority.
 */
function DashboardPage() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const summary = useMyTickets()
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const search = useDebouncedValue(filters.q.trim(), 300)
  // A status filter can be Closed, so it replaces the Active/All view rather than adding to it.
  const list = useMyTickets({
    view: filters.status || filters.view === 'all' ? undefined : filters.view,
    status: filters.status || undefined,
    q: search || undefined,
  })
  const firstName = user.full_name.split(' ')[0]
  const filtersActive = filters.status !== '' || filters.q.trim() !== '' || filters.view !== 'active'
  const clearFilters = () => setFilters(DEFAULT_FILTERS)

  const pickTile = (key) =>
    setFilters((current) =>
      key === 'active'
        ? { ...current, view: 'active', status: '' }
        : { ...current, status: current.status === key ? '' : key },
    )
  const refresh = () => {
    summary.reload()
    list.reload()
  }

  let content
  if (summary.loading && summary.tickets.length === 0) {
    content = <SummarySkeleton />
  } else if (summary.error) {
    content = <ErrorState message={summary.error.message} onRetry={summary.reload} />
  } else if (summary.tickets.length === 0) {
    content = <NoTicketsYet />
  } else {
    const { counts, latest } = summarize(summary.tickets)
    const tiles = <CountTiles counts={counts} status={filters.status} onPick={pickTile} compact={isMobile} />
    const highlight = <LatestTicketCard ticket={latest} compact={isMobile} onNoteAdded={refresh} />
    const panel = (
      <TicketsPanel
        filters={filters}
        onChange={setFilters}
        list={list}
        filtersActive={filtersActive}
        onClearFilters={clearFilters}
        compact={isMobile}
      />
    )

    content = isMobile ? (
      <>
        {tiles}
        {highlight}
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
            gridTemplateColumns: { xs: 'minmax(0,1fr)', lg: 'minmax(0,1fr) 400px' },
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
            {highlight}
            <RecentUpdates tickets={summary.tickets} />
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
        minHeight: isMobile ? PHONE_MIN_HEIGHT : undefined,
        '@media (min-width: 1200px)': FILL_FRAME_SX,
      }}
    >
      <PageHeader firstName={firstName} compact={isMobile} />
      {content}
      {isMobile && <PinnedCreateBar />}
    </Box>
  )
}

export default DashboardPage
