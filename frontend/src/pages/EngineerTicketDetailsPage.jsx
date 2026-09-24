import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import Alert from '@mui/material/Alert'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Skeleton from '@mui/material/Skeleton'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import BlockIcon from '@mui/icons-material/Block'
import CallIcon from '@mui/icons-material/Call'
import CheckIcon from '@mui/icons-material/Check'
import HourglassTopIcon from '@mui/icons-material/HourglassTop'
import MailOutlineIcon from '@mui/icons-material/MailOutlined'
import PauseIcon from '@mui/icons-material/Pause'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PriorityHighIcon from '@mui/icons-material/PriorityHigh'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import SendIcon from '@mui/icons-material/Send'
import TaskAltIcon from '@mui/icons-material/TaskAlt'
import UndoIcon from '@mui/icons-material/Undo'
import { Link as RouterLink, useParams } from 'react-router'

import useAuth from '../auth/useAuth'
import { panelHeadingSx, visuallyHiddenSx } from '../components/admin/panelStyles'
import { PriorityPill, StatusPill } from '../components/admin/TicketPills'
import BackLink from '../components/BackLink'
import ErrorState from '../components/ErrorState'
import useApiData from '../hooks/useApiData'
import useIsMobile from '../hooks/useIsMobile'
import { ApiError } from '../services/apiClient'
import {
  addAssignedTicketNote,
  changeTicketStatus,
  getAssignedTicket,
  listAssignedTicketHistory,
  listAssignedTicketNotes,
} from '../services/engineerTicketService'
import { CATEGORIES, formatAge, formatDateTime, PRIORITIES, SCOPES, STATUSES } from '../utils/ticketFormat'
import { describeStatusChange, engineerMoves, workflowState } from '../utils/ticketWorkflow'

// AppLayout puts this page in a 1200px column under the 64px header, with 16px of padding
// above and below. On large screens the page breaks out to the full window width (24px
// gutters) and takes exactly the height that's left, so nothing scrolls but the panels.
const FULL_WIDTH_SX = {
  mx: 'calc(50% - 50vw + 24px)',
  height: 'calc(100dvh - 96px)',
  minHeight: 600,
}
const GAP = 1.5
const MUTED = 'rgba(0,0,0,.15)'
const BLOCKED = STATUSES.blocked.dot
// The mockup's red, for "Blocked" and "Escalated" text; passes AA contrast on white.
const RED = '#B3261E'
const NOTE_LIMIT = 2000
const REASON_LIMIT = 500

/**
 * A panel body that scrolls, with a soft shadow along an edge while there's more to
 * scroll that way (CSS only: the white covers move with the content and hide the shadows
 * once you reach that end).
 */
const SCROLL_SX = {
  overflow: 'auto',
  background: [
    'linear-gradient(#fff 30%, rgba(255,255,255,0)) center top / 100% 40px no-repeat local',
    'linear-gradient(rgba(255,255,255,0), #fff 70%) center bottom / 100% 40px no-repeat local',
    'radial-gradient(farthest-side at 50% 0, rgba(0,0,0,.14), rgba(0,0,0,0)) center top / 100% 14px no-repeat scroll',
    'radial-gradient(farthest-side at 50% 100%, rgba(0,0,0,.14), rgba(0,0,0,0)) center bottom / 100% 14px no-repeat scroll',
  ].join(', '),
}

// Read by screen readers after each step's name, e.g. "Open (current status)".
const STATE_TEXT = {
  done: 'done',
  current: 'current status',
  paused: 'paused while blocked',
  upcoming: 'not reached yet',
}

/**
 * How each move the workflow allows (engineerMoves) looks here, keyed "from>to": its
 * button, whether it's the main one, and for moves that need a reason, the inline box.
 */
const MOVE_LOOK = {
  'open>in_progress': { label: 'Start work', Icon: PlayArrowIcon, main: true },
  'in_progress>blocked': {
    label: 'Mark blocked',
    Icon: BlockIcon,
    main: false,
    ask: {
      placeholder: 'Why is it blocked? The requester will see this.',
      tint: '#FDECEA',
      iconColor: RED,
      buttonSx: { bgcolor: RED, '&:hover': { bgcolor: '#8C1D18' } },
    },
  },
  'in_progress>resolved': {
    label: 'Mark resolved',
    Icon: TaskAltIcon,
    main: true,
    ask: {
      placeholder: 'What did you do? The requester will see this.',
      tint: '#E8F5E9',
      iconColor: '#2E7D32',
      buttonSx: {},
    },
  },
  'blocked>in_progress': { label: 'Resume work', Icon: PlayArrowIcon, main: true },
  'resolved>in_progress': { label: 'Reopen', Icon: UndoIcon, main: false },
}

const ticketShape = PropTypes.shape({
  ticket_id: PropTypes.number.isRequired,
  title: PropTypes.string.isRequired,
  description: PropTypes.string.isRequired,
  priority: PropTypes.string.isRequired,
  status: PropTypes.oneOf(Object.keys(STATUSES)).isRequired,
  category: PropTypes.string.isRequired,
  affected_scope: PropTypes.oneOf(Object.keys(SCOPES)).isRequired,
  building_name: PropTypes.string.isRequired,
  floor_number: PropTypes.number,
  seat_number: PropTypes.string,
  blocked_reason: PropTypes.string,
  escalation_requested: PropTypes.bool.isRequired,
  escalation_reason: PropTypes.string,
  created_by_name: PropTypes.string.isRequired,
  created_by_email: PropTypes.string.isRequired,
  created_by_phone: PropTypes.string,
  created_at: PropTypes.string.isRequired,
  updated_at: PropTypes.string.isRequired,
  resolved_at: PropTypes.string,
})

const listShape = PropTypes.shape({
  data: PropTypes.array,
  loading: PropTypes.bool.isRequired,
  error: PropTypes.instanceOf(Error),
  reload: PropTypes.func.isRequired,
})

const errorMessage = (err) => (err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')

/** "Jane Doe" -> "JD", for the small round avatars. */
const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')

/**
 * How long ago, in words: "just now", "12 min ago", "3 hours ago", "2 days ago".
 * @param {string} iso
 */
function ago(iso) {
  const age = formatAge(iso)
  if (age === 'just now') return age
  const [count, unit] = age.split(' ')
  const words = { min: 'min', h: count === '1' ? 'hour' : 'hours', d: count === '1' ? 'day' : 'days' }
  return `${count} ${words[unit]} ago`
}

/** The moves the engineer can make from this status, as buttons: secondary first, main last. */
function statusButtons(status) {
  return engineerMoves(status)
    .map((move) => ({ ...move, ...MOVE_LOOK[`${status}>${move.to}`] }))
    .sort((a, b) => Number(a.main) - Number(b.main))
}

/** The ticket's facts as [term, value] pairs, leaving out what it doesn't have. */
function ticketFacts(t) {
  const floorAndSeat = [t.floor_number != null && `Floor ${t.floor_number}`, t.seat_number && `Seat ${t.seat_number}`]
    .filter(Boolean)
    .join(' · ')
  return [
    ['Category', CATEGORIES[t.category]],
    ['Priority', `${t.priority} · ${PRIORITIES[t.priority].description}`],
    ['Impact', SCOPES[t.affected_scope]],
    ['Escalated', t.escalation_requested ? 'Yes' : 'No'],
    ['Building', t.building_name],
    floorAndSeat && ['Floor · Seat', floorAndSeat],
    ['Created', formatDateTime(t.created_at)],
    ['Last update', formatDateTime(t.updated_at)],
    t.resolved_at && ['Resolved', formatDateTime(t.resolved_at)],
  ].filter(Boolean)
}

function BackToQueue() {
  return <BackLink to="/engineer">Back to my queue</BackLink>
}

/** The back link as the mockup draws it: small, and underlined only on hover. */
function CompactBackLink() {
  return (
    <Box sx={{ flex: 'none', fontSize: 13, fontWeight: 500, '& a': { textDecoration: 'none' }, '& a:hover': { textDecoration: 'underline' } }}>
      <BackToQueue />
    </Box>
  )
}

function NotFound() {
  return (
    <Stack spacing={2}>
      <BackToQueue />
      <Card>
        <CardContent>
          <Typography variant="h4" component="h1" gutterBottom>
            Ticket not found
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            It may not exist, or it isn&apos;t assigned to you (it may have been reassigned).
          </Typography>
          <Button variant="contained" component={RouterLink} to="/engineer">
            Go to my queue
          </Button>
        </CardContent>
      </Card>
    </Stack>
  )
}

/** A titled white card, labelled by its title for screen readers. May shrink and scroll. */
function Section({ title, aside = null, children, sx = {} }) {
  return (
    <Card component="section" aria-label={title} sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, ...sx }}>
      <Box sx={{ flex: 'none', display: 'flex', alignItems: 'baseline', gap: 1, px: 2.5, pt: 1.75, pb: 1 }}>
        <Typography component="h2" sx={panelHeadingSx}>
          {title}
        </Typography>
        {aside && (
          <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary' }}>
            {aside}
          </Typography>
        )}
      </Box>
      {children}
    </Card>
  )
}

Section.propTypes = {
  title: PropTypes.string.isRequired,
  aside: PropTypes.node,
  children: PropTypes.node.isRequired,
  sx: PropTypes.object,
}

/** "Escalated" in a red outline, with the "!" icon. The word carries the meaning. */
function EscalatedPill() {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        height: 22,
        px: 1,
        boxSizing: 'border-box',
        borderRadius: 11,
        border: `1px solid ${RED}`,
        color: RED,
        fontSize: 12,
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}
    >
      <PriorityHighIcon aria-hidden="true" sx={{ fontSize: 14 }} />
      Escalated
    </Box>
  )
}

/** "#12", priority, status, escalation, and who reported it (desktop) or when (phone). */
function MetaRow({ ticket: t, phone }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, fontSize: 13, color: 'text.secondary' }}>
      {!phone && (
        // The number is also in the heading, for screen readers.
        <Box component="span" aria-hidden="true" sx={{ fontWeight: 600, color: 'primary.main' }}>
          #{t.ticket_id}
        </Box>
      )}
      <PriorityPill priority={t.priority} />
      <StatusPill status={t.status} />
      {t.escalation_requested && <EscalatedPill />}
      {phone ? (
        <Box component="span" sx={{ ml: 'auto', fontSize: 12 }}>
          {ago(t.created_at)}
        </Box>
      ) : (
        <span>
          Reported {ago(t.created_at)} by {t.created_by_name} · Impact: {SCOPES[t.affected_scope]}
        </span>
      )}
    </Box>
  )
}

MetaRow.propTypes = {
  ticket: ticketShape.isRequired,
  phone: PropTypes.bool.isRequired,
}

/** "#12 Title": the number is hidden on screen (the meta row shows it) but read aloud. */
function TicketTitle({ ticket: t, fontSize }) {
  return (
    <Typography component="h1" sx={{ m: 0, fontSize, fontWeight: 600, lineHeight: 1.3, color: 'secondary.main' }}>
      <Box component="span" sx={visuallyHiddenSx}>
        #{t.ticket_id}
      </Box>{' '}
      {t.title}
    </Typography>
  )
}

TicketTitle.propTypes = {
  ticket: ticketShape.isRequired,
  fontSize: PropTypes.number.isRequired,
}

/** One step's round marker: a check when done, filled when current, pause when blocked. */
function StepDot({ state }) {
  const filled = state === 'done' || state === 'current'
  const Icon = { done: CheckIcon, current: TaskAltIcon, paused: PauseIcon, upcoming: RadioButtonUncheckedIcon }[state]
  return (
    <Box
      aria-hidden="true"
      sx={{
        width: 24,
        height: 24,
        flex: 'none',
        boxSizing: 'border-box',
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        bgcolor: filled ? 'primary.main' : state === 'paused' ? BLOCKED : 'background.paper',
        color: state === 'upcoming' ? 'rgba(0,0,0,.38)' : 'common.white',
        border: state === 'upcoming' ? '1px solid rgba(0,0,0,.26)' : 'none',
      }}
    >
      <Icon sx={{ fontSize: 15 }} />
    </Box>
  )
}

StepDot.propTypes = {
  state: PropTypes.oneOf(Object.keys(STATE_TEXT)).isRequired,
}

/** Screen-reader text after a step's name, and aria-current on the step the ticket is at. */
function stepA11y(step) {
  const here = step.state === 'current' || step.state === 'paused'
  return {
    current: here ? 'step' : undefined,
    text: ` (${STATE_TEXT[step.state]})`,
  }
}

/**
 * Open -> In progress -> Resolved -> Closed along the bottom of the header. Blocked is a
 * side state, not a step: a blocked ticket pauses at In progress, with the reason under it.
 */
function ProgressSteps({ status, blockedReason = null }) {
  const { steps } = workflowState(status)
  return (
    <Box
      component="ol"
      aria-label="Ticket workflow"
      sx={{ gridArea: 'steps', listStyle: 'none', m: 0, p: 0, display: 'flex', alignItems: 'center', minWidth: 0 }}
    >
      {steps.map((step, index) => {
        const last = index === steps.length - 1
        const reached = step.state !== 'upcoming'
        const { current, text } = stepA11y(step)
        return (
          <Box
            component="li"
            key={step.status}
            aria-current={current}
            sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: last ? 'none' : 1, minWidth: 0 }}
          >
            <StepDot state={step.state} />
            <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <Typography
                component="span"
                sx={{
                  fontSize: 13,
                  whiteSpace: 'nowrap',
                  fontWeight: step.state === 'current' || step.state === 'paused' ? 700 : 500,
                  color: reached ? 'secondary.main' : 'text.secondary',
                }}
              >
                {STATUSES[step.status].label}
                <Box component="span" sx={visuallyHiddenSx}>
                  {text}
                </Box>
              </Typography>
              {step.state === 'paused' && (
                <Typography
                  component="span"
                  title={blockedReason ?? undefined}
                  sx={{ fontSize: 12, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  <Box component="span" sx={{ fontWeight: 600, color: RED }}>
                    Blocked
                  </Box>
                  {blockedReason && `: ${blockedReason}`}
                </Typography>
              )}
            </Box>
            {!last && (
              <Box
                aria-hidden="true"
                sx={{
                  flex: 1,
                  minWidth: 16,
                  height: 2,
                  mx: 1.5,
                  bgcolor: steps[index + 1].state !== 'upcoming' ? 'primary.main' : MUTED,
                }}
              />
            )}
          </Box>
        )
      })}
    </Box>
  )
}

ProgressSteps.propTypes = {
  status: PropTypes.oneOf(Object.keys(STATUSES)).isRequired,
  blockedReason: PropTypes.string,
}

/** The phone's progress: one short bar per step, then "Step 2 of 4 · In Progress". */
function ProgressBars({ status, blockedReason = null }) {
  const { steps, blocked } = workflowState(status)
  const at = steps.findIndex((step) => step.state === 'current' || step.state === 'paused')
  return (
    <>
      <Box component="ol" aria-label="Ticket workflow" sx={{ listStyle: 'none', m: 0, p: 0, pt: 0.5, display: 'flex', gap: 0.5 }}>
        {steps.map((step) => {
          const { current, text } = stepA11y(step)
          return (
            <Box
              component="li"
              key={step.status}
              aria-current={current}
              sx={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                bgcolor: { upcoming: 'rgba(0,0,0,.12)', paused: BLOCKED }[step.state] ?? 'primary.main',
              }}
            >
              <Box component="span" sx={visuallyHiddenSx}>
                {STATUSES[step.status].label}
                {text}
              </Box>
            </Box>
          )
        })}
      </Box>
      <Typography sx={{ fontSize: 12, color: blocked ? RED : 'text.secondary', overflowWrap: 'anywhere' }}>
        {blocked
          ? `Blocked${blockedReason ? `: ${blockedReason}` : ''}`
          : `Step ${at + 1} of ${steps.length} · ${STATUSES[status].label}`}
      </Typography>
    </>
  )
}

ProgressBars.propTypes = ProgressSteps.propTypes

/**
 * The inline "why?" box for a move that needs a reason (blocking, resolving), in place of
 * a dialog. Enter confirms and Escape cancels. `error` is the API's refusal.
 */
function ReasonBar({ move, sending, error, phone, onCancel, onConfirm }) {
  const [reason, setReason] = useState('')
  const [problem, setProblem] = useState('')
  const { ask, Icon } = move
  const shown = problem || error

  const handleSubmit = (event) => {
    event.preventDefault()
    const text = reason.trim()
    let issue = ''
    if (!text) issue = 'Write a reason first.'
    else if (text.length > REASON_LIMIT) issue = `Use ${REASON_LIMIT} characters or fewer.`
    setProblem(issue)
    if (!issue) onConfirm(text)
  }

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      noValidate
      onKeyDown={(event) => event.key === 'Escape' && !sending && onCancel()}
      sx={{ gridArea: 'reason', bgcolor: ask.tint, borderRadius: 1.5, px: 1.5, py: 1.25 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        {!phone && <Icon aria-hidden="true" sx={{ color: ask.iconColor, fontSize: 20 }} />}
        <TextField
          size="small"
          autoFocus
          value={reason}
          onChange={(event) => {
            setReason(event.target.value)
            setProblem('')
          }}
          placeholder={ask.placeholder}
          disabled={sending}
          error={Boolean(shown)}
          slotProps={{ htmlInput: { 'aria-label': move.reason.label } }}
          sx={{ flex: '1 1 240px', bgcolor: 'background.paper', '& .MuiInputBase-root': { height: phone ? 44 : 36, fontSize: 14 } }}
        />
        <Stack direction="row" spacing={1} sx={{ flex: phone ? '1 1 100%' : 'none' }}>
          <Button
            type="submit"
            variant="contained"
            disabled={sending}
            sx={{ height: phone ? 44 : 36, flex: phone ? 1 : 'none', whiteSpace: 'nowrap', ...ask.buttonSx }}
          >
            {sending ? 'Saving…' : move.label}
          </Button>
          <Button onClick={onCancel} disabled={sending} sx={{ height: phone ? 44 : 36 }}>
            Cancel
          </Button>
        </Stack>
      </Box>
      {shown && (
        <Typography role="alert" sx={{ mt: 0.75, fontSize: 12, color: RED }}>
          {shown}
        </Typography>
      )}
    </Box>
  )
}

ReasonBar.propTypes = {
  move: PropTypes.shape({
    label: PropTypes.string.isRequired,
    Icon: PropTypes.elementType.isRequired,
    reason: PropTypes.shape({ label: PropTypes.string.isRequired }).isRequired,
    ask: PropTypes.shape({
      placeholder: PropTypes.string.isRequired,
      tint: PropTypes.string.isRequired,
      iconColor: PropTypes.string.isRequired,
      buttonSx: PropTypes.object.isRequired,
    }).isRequired,
  }).isRequired,
  sending: PropTypes.bool.isRequired,
  error: PropTypes.string.isRequired,
  phone: PropTypes.bool.isRequired,
  onCancel: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
}

/**
 * The engineer's status buttons: only the moves allowed from here. Blocking and resolving
 * ask for a reason inline first. On larger screens the buttons sit top right of the header
 * and the reason box spans it (the section is `display: contents`, so both are header grid
 * cells). On phones they're pinned to the bottom of the screen.
 * `onMoved(ticket)` gets the updated ticket; `onFailed(message)` a refusal with no box open.
 */
function StatusActions({ ticket, phone, onMoved, onFailed }) {
  const [asking, setAsking] = useState(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const buttons = statusButtons(ticket.status)
  const height = phone ? 44 : 36

  const makeMove = async (move, reason) => {
    setSending(true)
    setError('')
    try {
      const updated = await changeTicketStatus(ticket.ticket_id, move.to, reason)
      setAsking(null)
      onMoved(updated)
    } catch (err) {
      if (move.ask) setError(errorMessage(err))
      else onFailed(errorMessage(err))
    } finally {
      setSending(false)
    }
  }

  let row
  if (asking) {
    row = null
  } else if (ticket.status === 'closed') {
    row = (
      <Typography sx={{ fontSize: 13, color: 'text.secondary', textAlign: phone ? 'center' : 'right' }}>
        This ticket is closed, so its status can&apos;t change.
      </Typography>
    )
  } else {
    row = (
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'flex-end' }}>
        {ticket.status === 'resolved' && (
          <Typography
            sx={{ flex: phone ? 1 : 'none', display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 13, color: 'text.secondary' }}
          >
            <HourglassTopIcon aria-hidden="true" sx={{ fontSize: 18, color: 'success.main' }} />
            Waiting for the admin to close it
          </Typography>
        )}
        {buttons.map((move) => (
          <Button
            key={move.to}
            variant={move.main ? 'contained' : 'outlined'}
            startIcon={phone ? null : <move.Icon />}
            disabled={sending}
            onClick={() => {
              setError('')
              if (move.ask) setAsking(move)
              else makeMove(move)
            }}
            sx={{ height, flex: phone && ticket.status !== 'resolved' ? 1 : 'none', whiteSpace: 'nowrap' }}
          >
            {move.label}
          </Button>
        ))}
      </Stack>
    )
  }

  const reasonBar = asking && (
    <ReasonBar
      move={asking}
      sending={sending}
      error={error}
      phone={phone}
      onCancel={() => {
        setAsking(null)
        setError('')
      }}
      onConfirm={(reason) => makeMove(asking, reason)}
    />
  )

  if (phone) {
    return (
      <Stack
        component="section"
        aria-label="Change status"
        spacing={1}
        sx={{ position: 'sticky', bottom: 0, zIndex: 1, mx: -2, px: 2, py: 1.25, bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider' }}
      >
        {reasonBar}
        {row}
      </Stack>
    )
  }

  return (
    <Box component="section" aria-label="Change status" sx={{ display: 'contents' }}>
      {row && <Box sx={{ gridArea: 'actions', justifySelf: { md: 'end' } }}>{row}</Box>}
      {reasonBar}
    </Box>
  )
}

StatusActions.propTypes = {
  ticket: ticketShape.isRequired,
  phone: PropTypes.bool.isRequired,
  onMoved: PropTypes.func.isRequired,
  onFailed: PropTypes.func.isRequired,
}

/** The desktop header: meta and title, status actions top right, progress along the bottom. */
function TicketHeader({ ticket: t, onMoved, onFailed }) {
  return (
    <Card
      component="section"
      aria-label="Progress"
      sx={{
        flex: 'none',
        px: 2.5,
        py: 2,
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'minmax(0,1fr) auto' },
        gridTemplateAreas: {
          xs: '"title" "actions" "reason" "rule" "steps"',
          md: '"title actions" "reason reason" "rule rule" "steps steps"',
        },
        alignItems: 'center',
        columnGap: 3,
        rowGap: 1.5,
      }}
    >
      <Stack spacing={0.75} sx={{ gridArea: 'title', minWidth: 0 }}>
        <MetaRow ticket={t} phone={false} />
        <TicketTitle ticket={t} fontSize={22} />
      </Stack>
      <StatusActions ticket={t} phone={false} onMoved={onMoved} onFailed={onFailed} />
      <Box aria-hidden="true" sx={{ gridArea: 'rule', borderTop: 1, borderColor: 'divider' }} />
      <ProgressSteps status={t.status} blockedReason={t.blocked_reason} />
    </Card>
  )
}

TicketHeader.propTypes = {
  ticket: ticketShape.isRequired,
  onMoved: PropTypes.func.isRequired,
  onFailed: PropTypes.func.isRequired,
}

/** The employee's reason for asking an admin to look at the ticket. */
function EscalationAlert({ ticket: t }) {
  return (
    <Alert severity="warning" sx={{ py: 0, px: 1.25, fontSize: 13, '& .MuiAlert-icon': { fontSize: 18, mr: 1 } }}>
      <Box component="span" sx={{ fontWeight: 600 }}>
        {t.created_by_name} asked for an admin to review this ticket:
      </Box>{' '}
      <Box component="span" sx={{ whiteSpace: 'pre-wrap' }}>
        {t.escalation_reason}
      </Box>
    </Alert>
  )
}

EscalationAlert.propTypes = {
  ticket: ticketShape.isRequired,
}

/** The facts as a two-column description list. */
function FactGrid({ ticket }) {
  return (
    <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 2, rowGap: 1.5 }}>
      {ticketFacts(ticket).map(([term, value]) => (
        <Box key={term} sx={{ minWidth: 0 }}>
          <Typography component="dt" sx={{ fontSize: 12, color: 'text.secondary' }}>
            {term}
          </Typography>
          <Typography component="dd" sx={{ m: 0, fontSize: 14, overflowWrap: 'anywhere' }}>
            {value}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}

FactGrid.propTypes = {
  ticket: ticketShape.isRequired,
}

/** The escalation (if any), the full description and the facts. */
function DetailsBody({ ticket: t }) {
  return (
    <Stack spacing={1.5}>
      {t.escalation_requested && <EscalationAlert ticket={t} />}
      <Typography sx={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {t.description}
      </Typography>
      <Box sx={{ pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
        <FactGrid ticket={t} />
      </Box>
    </Stack>
  )
}

DetailsBody.propTypes = {
  ticket: ticketShape.isRequired,
}

/** Loading, failure or "none yet" for a list; null once there's something to show. */
function listPlaceholder(list, what, empty) {
  if (list.error) return <ErrorState message={list.error.message} onRetry={list.reload} />
  if (list.loading && !list.data) return <Skeleton variant="rounded" height={80} aria-label={`Loading ${what}`} />
  if (list.data.length === 0) return <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>{empty}</Typography>
  return null
}

/**
 * The notes as a conversation, oldest first: the engineer's own on the right in blue, the
 * requester's and others' on the left. Scrolls to the newest when one arrives.
 */
function NoteBubbles({ notes, phone }) {
  const { user } = useAuth()
  const listRef = useRef(null)
  const count = notes.data?.length ?? 0

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [count])

  const placeholder = listPlaceholder(notes, 'notes', 'No notes yet. Say hello to the requester.')
  if (placeholder) return <Box sx={{ px: phone ? 0 : 2.5, pb: 2 }}>{placeholder}</Box>

  return (
    <Stack
      ref={listRef}
      component="ol"
      spacing={1.25}
      sx={{ listStyle: 'none', m: 0, px: phone ? 0 : 2.5, pt: 0.5, pb: 1.5, flex: 1, minHeight: 0, ...(phone ? {} : SCROLL_SX) }}
    >
      {notes.data.map((note) => {
        const mine = note.user_id === user.user_id
        return (
          <Box
            component="li"
            key={note.note_id}
            sx={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', gap: '3px' }}
          >
            <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary' }}>
              {mine ? 'You' : note.author_name} · {ago(note.created_at)}
            </Typography>
            <Typography
              title={formatDateTime(note.created_at)}
              sx={{
                maxWidth: phone ? '88%' : '85%',
                px: 1.5,
                py: 1,
                borderRadius: 2.5,
                bgcolor: mine ? 'primary.main' : '#EEF3F8',
                color: mine ? 'common.white' : 'text.primary',
                fontSize: 14,
                lineHeight: 1.45,
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
              }}
            >
              {note.note_text}
            </Typography>
          </Box>
        )
      })}
    </Stack>
  )
}

NoteBubbles.propTypes = {
  notes: listShape.isRequired,
  phone: PropTypes.bool.isRequired,
}

/**
 * The one-line note box at the bottom of Notes: Enter or Send posts it. Closed tickets
 * take no notes (the API rejects them), so they get a line saying so instead.
 */
function NoteComposer({ ticket, phone, onAdded }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const height = phone ? 44 : 38
  const frameSx = { flex: 'none', px: phone ? 2 : 1.5, py: 1.25, bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider' }

  if (ticket.status === 'closed') {
    return (
      <Typography sx={{ ...frameSx, fontSize: 13, color: 'text.secondary' }}>
        This ticket is closed, so new notes can&apos;t be added.
      </Typography>
    )
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const note = text.trim()
    if (!note) {
      setError('Write a note first.')
      return
    }
    if (note.length > NOTE_LIMIT) {
      setError(`Use ${NOTE_LIMIT} characters or fewer.`)
      return
    }
    setSending(true)
    setError('')
    try {
      await addAssignedTicketNote(ticket.ticket_id, note)
      setText('')
      onAdded()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      noValidate
      sx={phone ? { ...frameSx, position: 'sticky', bottom: 0, zIndex: 1, mx: -2 } : frameSx}
    >
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          size="small"
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            if (error) setError('')
          }}
          placeholder={phone ? 'Write a note…' : "Tell the requester what you've found or what happens next."}
          disabled={sending}
          error={Boolean(error)}
          slotProps={{ htmlInput: { 'aria-label': 'Add a note' } }}
          sx={{ flex: 1, '& .MuiInputBase-root': { height, fontSize: phone ? 15 : 14 } }}
        />
        <Button
          type="submit"
          variant="contained"
          disabled={sending}
          aria-label={phone ? 'Send' : undefined}
          startIcon={phone ? null : <SendIcon />}
          sx={{ height, minWidth: phone ? height : undefined, px: phone ? 0 : 2 }}
        >
          {phone ? <SendIcon fontSize="small" /> : 'Send'}
        </Button>
      </Box>
      {error && (
        <Typography role="alert" sx={{ mt: 0.5, fontSize: 12, color: RED }}>
          {error}
        </Typography>
      )}
    </Box>
  )
}

NoteComposer.propTypes = {
  ticket: ticketShape.isRequired,
  phone: PropTypes.bool.isRequired,
  onAdded: PropTypes.func.isRequired,
}

/** Who reported the ticket, with buttons to email or call them. */
function RequesterCard({ ticket: t, phone }) {
  const tel = t.created_by_phone && `tel:${t.created_by_phone.replace(/[^\d+]/g, '')}`
  const avatar = (
    <Avatar
      aria-hidden="true"
      sx={{ width: phone ? 32 : 36, height: phone ? 32 : 36, fontSize: 12, fontWeight: 600, bgcolor: '#E6F0F8', color: 'secondary.main' }}
    >
      {initials(t.created_by_name)}
    </Avatar>
  )

  if (phone) {
    return (
      <Card component="section" aria-label="Requester" sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 0.5, pl: 1.5, pr: 0.5 }}>
        {avatar}
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary' }}>
            Requester
          </Typography>
          <Typography component="span" sx={{ fontSize: 14 }}>
            {t.created_by_name}
          </Typography>
        </Box>
        <Button href={`mailto:${t.created_by_email}`} aria-label={`Email ${t.created_by_email}`} sx={{ minWidth: 44, height: 44 }}>
          <MailOutlineIcon />
        </Button>
        {tel && (
          <Button href={tel} aria-label={`Call ${t.created_by_phone}`} sx={{ minWidth: 44, height: 44 }}>
            <CallIcon />
          </Button>
        )}
      </Card>
    )
  }

  return (
    <Section title="Requester" sx={{ flex: 'none' }}>
      <Stack spacing={1.25} sx={{ px: 2, pb: 1.75 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          {avatar}
          <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <Typography component="span" sx={{ fontSize: 14, fontWeight: 600 }}>
              {t.created_by_name}
            </Typography>
            <Typography component="span" sx={{ fontSize: 13, color: 'text.secondary', overflowWrap: 'anywhere' }}>
              {t.created_by_email}
            </Typography>
          </Box>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            href={`mailto:${t.created_by_email}`}
            startIcon={<MailOutlineIcon />}
            sx={{ flex: 1, height: 34, fontSize: 13 }}
          >
            Email
          </Button>
          {tel ? (
            <Button variant="outlined" href={tel} startIcon={<CallIcon />} sx={{ flex: 1, height: 34, fontSize: 13, whiteSpace: 'nowrap' }}>
              {t.created_by_phone}
            </Button>
          ) : (
            <Typography sx={{ flex: 1, alignSelf: 'center', textAlign: 'center', fontSize: 13, color: 'text.secondary', whiteSpace: 'nowrap' }}>
              No phone given
            </Typography>
          )}
        </Stack>
      </Stack>
    </Section>
  )
}

RequesterCard.propTypes = {
  ticket: ticketShape.isRequired,
  phone: PropTypes.bool.isRequired,
}

/** Every status change, newest first: what it became, who did it and why, and when. */
function HistoryFeed({ history }) {
  const { user } = useAuth()
  const placeholder = listPlaceholder(history, 'status history', 'No status changes yet.')
  if (placeholder) return placeholder

  return (
    <Stack component="ol" aria-label="Status history" spacing={1.25} sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {[...history.data].reverse().map((change) => {
        const who = change.changed_by_user_id === user.user_id ? 'You' : change.changed_by_name
        return (
          <Box
            component="li"
            key={change.history_id}
            sx={{ display: 'grid', gridTemplateColumns: '10px minmax(0,1fr) auto', gap: 1.25, alignItems: 'start' }}
          >
            <Box aria-hidden="true" sx={{ width: 10, height: 10, mt: '4px', borderRadius: '50%', bgcolor: STATUSES[change.to_status].dot }} />
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 500, lineHeight: 1.35 }}>{describeStatusChange(change).label}</Typography>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {who}
                {change.reason && ` · ${change.reason}`}
              </Typography>
            </Box>
            <Typography title={formatDateTime(change.changed_at)} sx={{ fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap' }}>
              {ago(change.changed_at)}
            </Typography>
          </Box>
        )
      })}
    </Stack>
  )
}

HistoryFeed.propTypes = {
  history: listShape.isRequired,
}

const notesAside = (notes) => notes.data && `${notes.data.length} · the requester sees these`

/**
 * Large screens: header on top, then Details | Notes (with the note box pinned to its
 * bottom) | Requester and Status history, all in one screen with no page scroll.
 */
function DesktopLayout({ ticket: t, history, notes, onMoved, onFailed, onNoteAdded }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: GAP, '@media (min-width: 1200px)': FULL_WIDTH_SX }}>
      <CompactBackLink />
      <TicketHeader ticket={t} onMoved={onMoved} onFailed={onFailed} />

      <Box
        sx={{
          flex: { lg: 1 },
          minHeight: 0,
          display: 'grid',
          gap: GAP,
          gridTemplateColumns: {
            xs: 'minmax(0,1fr)',
            md: 'repeat(2, minmax(0,1fr))',
            lg: 'minmax(0,1fr) minmax(0,1.1fr) 340px',
          },
          gridTemplateRows: { lg: 'minmax(0,1fr)' },
        }}
      >
        <Section title="Details">
          <Box sx={{ px: 2.5, pb: 2, ...SCROLL_SX }}>
            <DetailsBody ticket={t} />
          </Box>
        </Section>

        <Section title="Notes" aside={notesAside(notes)} sx={{ minHeight: { xs: 360, lg: 0 } }}>
          <NoteBubbles notes={notes} phone={false} />
          <NoteComposer ticket={t} phone={false} onAdded={onNoteAdded} />
        </Section>

        <Box
          sx={{
            gridColumn: { md: '1 / -1', lg: 'auto' },
            minHeight: 0,
            display: 'grid',
            gap: GAP,
            gridTemplateColumns: { md: 'repeat(2, minmax(0,1fr))', lg: 'minmax(0,1fr)' },
            gridTemplateRows: { lg: 'auto minmax(0,1fr)' },
            alignItems: { md: 'start', lg: 'stretch' },
          }}
        >
          <RequesterCard ticket={t} phone={false} />
          <Section title="Status history" aside={history.data && `${history.data.length} · newest first`}>
            <Box sx={{ px: 2, pb: 2, ...SCROLL_SX }}>
              <HistoryFeed history={history} />
            </Box>
          </Section>
        </Box>
      </Box>
    </Box>
  )
}

DesktopLayout.propTypes = {
  ticket: ticketShape.isRequired,
  history: listShape.isRequired,
  notes: listShape.isRequired,
  onMoved: PropTypes.func.isRequired,
  onFailed: PropTypes.func.isRequired,
  onNoteAdded: PropTypes.func.isRequired,
}

const PHONE_TABS = ['details', 'notes', 'history']

/**
 * Phones: the summary and progress on top, then Details / Notes / History tabs. The status
 * buttons are pinned to the bottom, except on Notes, where the note box is.
 */
function PhoneLayout({ ticket: t, history, notes, onMoved, onFailed, onNoteAdded }) {
  const [tab, setTab] = useState('details')
  const labels = {
    details: 'Details',
    notes: notes.data ? `Notes (${notes.data.length})` : 'Notes',
    history: 'History',
  }

  return (
    <Stack spacing={GAP}>
      <BackToQueue />
      <Card component="section" aria-label="Progress" sx={{ px: 2, py: 1.5 }}>
        <Stack spacing={1}>
          <MetaRow ticket={t} phone />
          <TicketTitle ticket={t} fontSize={18} />
          <ProgressBars status={t.status} blockedReason={t.blocked_reason} />
        </Stack>
      </Card>

      <Card>
        <Tabs value={tab} onChange={(event, value) => setTab(value)} variant="fullWidth" aria-label="Ticket sections">
          {PHONE_TABS.map((key) => (
            <Tab key={key} value={key} label={labels[key]} id={`ticket-tab-${key}`} aria-controls={`ticket-panel-${key}`} />
          ))}
        </Tabs>
      </Card>

      <Box role="tabpanel" id={`ticket-panel-${tab}`} aria-labelledby={`ticket-tab-${tab}`}>
        {tab === 'details' && (
          <Stack spacing={GAP}>
            <Card component="section" aria-label="Details" sx={{ p: 2 }}>
              <DetailsBody ticket={t} />
            </Card>
            <RequesterCard ticket={t} phone />
          </Stack>
        )}
        {tab === 'notes' && (
          <Box component="section" aria-label="Notes">
            <NoteBubbles notes={notes} phone />
          </Box>
        )}
        {tab === 'history' && (
          <Card component="section" aria-label="Status history" sx={{ p: 2 }}>
            <HistoryFeed history={history} />
          </Card>
        )}
      </Box>

      {tab === 'notes' ? (
        <NoteComposer ticket={t} phone onAdded={onNoteAdded} />
      ) : (
        <StatusActions ticket={t} phone onMoved={onMoved} onFailed={onFailed} />
      )}
    </Stack>
  )
}

PhoneLayout.propTypes = DesktopLayout.propTypes

/**
 * One of the engineer's tickets, fitted to one screen on desktop: priority and status, where
 * it is in the workflow with the moves they can make from here, its details, the notes
 * conversation with the requester, how to reach them, and how the ticket got here.
 */
function EngineerTicketDetailsPage() {
  const { ticketId } = useParams()
  const phone = useIsMobile()
  const validId = /^[1-9]\d{0,9}$/.test(ticketId)
  const ticket = useApiData(getAssignedTicket, { ticketId }, { skip: !validId })
  const history = useApiData(listAssignedTicketHistory, { ticketId }, { skip: !validId })
  const notes = useApiData(listAssignedTicketNotes, { ticketId }, { skip: !validId })
  const [notice, setNotice] = useState(null)

  if (!validId || ticket.error?.status === 404) return <NotFound />
  if (ticket.error) {
    return (
      <Stack spacing={2}>
        <BackToQueue />
        <ErrorState message={ticket.error.message} onRetry={ticket.reload} />
      </Stack>
    )
  }
  if (!ticket.data) {
    return (
      <Stack spacing={GAP} aria-label="Loading ticket" aria-busy="true">
        <Skeleton variant="text" width={200} />
        <Skeleton variant="rounded" height={130} />
        <Skeleton variant="rounded" height={360} />
      </Stack>
    )
  }

  const say = (text, severity = 'success') => setNotice({ text, severity, key: Date.now(), open: true })
  // Keeps the text while the toast fades out.
  const hideNotice = () => setNotice((shown) => ({ ...shown, open: false }))
  const Layout = phone ? PhoneLayout : DesktopLayout

  return (
    <>
      <Layout
        ticket={ticket.data}
        history={history}
        notes={notes}
        // A status change moves the workflow, the facts (e.g. Resolved) and the history.
        onMoved={(updated) => {
          ticket.reload()
          history.reload()
          say(`Status changed to ${STATUSES[updated.status].label}.`)
        }}
        onFailed={(message) => say(message, 'error')}
        // A new note moves the ticket's updated_at, which the facts show.
        onNoteAdded={() => {
          ticket.reload()
          notes.reload()
        }}
      />
      <Snackbar
        key={notice?.key}
        open={Boolean(notice?.open)}
        autoHideDuration={4000}
        onClose={(event, reason) => reason !== 'clickaway' && hideNotice()}
        // Clear of the note box (desktop) and the pinned buttons (phone).
        anchorOrigin={phone ? { vertical: 'top', horizontal: 'center' } : { vertical: 'bottom', horizontal: 'left' }}
      >
        {notice && (
          <Alert variant="filled" severity={notice.severity} onClose={hideNotice}>
            {notice.text}
          </Alert>
        )}
      </Snackbar>
    </>
  )
}

export default EngineerTicketDetailsPage
