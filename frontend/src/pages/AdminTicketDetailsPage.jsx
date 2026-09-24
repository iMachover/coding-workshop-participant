import { useState } from 'react'
import PropTypes from 'prop-types'
import Alert from '@mui/material/Alert'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Link from '@mui/material/Link'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import CheckIcon from '@mui/icons-material/Check'
import PauseIcon from '@mui/icons-material/Pause'
import PriorityHighIcon from '@mui/icons-material/PriorityHigh'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import TaskAltIcon from '@mui/icons-material/TaskAlt'
import UndoIcon from '@mui/icons-material/Undo'
import { Link as RouterLink, useParams } from 'react-router'

import useAuth from '../auth/useAuth'
import { panelHeadingSx, visuallyHiddenSx } from '../components/admin/panelStyles'
import TicketAssignment from '../components/admin/TicketAssignment'
import { PriorityPill, StatusPill } from '../components/admin/TicketPills'
import BackLink from '../components/BackLink'
import ErrorState from '../components/ErrorState'
import ReasonDialog from '../components/tickets/ReasonDialog'
import useApiData from '../hooks/useApiData'
import useIsMobile from '../hooks/useIsMobile'
import { finishTicket, getTicket, listTicketHistory, listTicketNotes } from '../services/adminTicketService'
import { listEngineers } from '../services/adminUserService'
import { ApiError } from '../services/apiClient'
import {
  CATEGORIES,
  formatAge,
  formatDateTime,
  ROLES,
  SCOPES,
  STATUSES,
} from '../utils/ticketFormat'
import { describeStatusChange, workflowState } from '../utils/ticketWorkflow'

// AppLayout gives this page its full-screen frame: on large screens the frame is the window
// below the header, so the page fills it and nothing scrolls but the panels.
const FILL_FRAME_SX = { height: '100%' }
const GAP = 1.5
const MUTED = 'rgba(0,0,0,.15)'
const BLOCKED = STATUSES.blocked.dot
// Red outline for "Escalated", from the mockup; passes AA contrast on white.
const ESCALATED = '#B3261E'

/**
 * A panel body that scrolls, with a soft shadow along an edge while there's more to
 * scroll that way, so a cut-off list reads as "more below" even where scrollbars stay
 * hidden (macOS). CSS only: the white covers scroll with the content (`local`) and hide
 * the shadows (`scroll`, fixed to the edges) once you reach that end.
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

// The two ways an admin finishes a resolved ticket. Closing takes an optional note;
// sending back needs to say what's still wrong.
const FINISH_ACTIONS = {
  close: {
    to: 'closed',
    title: 'Close ticket',
    label: 'Closing note',
    hint: 'Optional. The employee sees it in the ticket history.',
    required: false,
    done: () => 'Ticket closed.',
  },
  sendBack: {
    to: 'in_progress',
    title: 'Send back to the engineer',
    label: "What's still wrong?",
    hint: 'The engineer and the employee see this in the ticket history.',
    required: true,
    done: (ticket) => `Sent back to ${ticket.assigned_to_name}.`,
  },
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
  assigned_to_name: PropTypes.string,
  blocked_reason: PropTypes.string,
  escalation_requested: PropTypes.bool.isRequired,
  escalation_reason: PropTypes.string,
  created_by_name: PropTypes.string.isRequired,
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

/** What the admin can do next, shown beside the progress steps. */
function finishHint(status) {
  if (status === 'resolved') {
    return "The engineer has resolved this. Close it, or send it back if the problem isn't fixed."
  }
  if (status === 'closed') return 'This ticket is closed.'
  return "The engineer hasn't resolved this yet. You can close it once they have."
}

/** The ticket's facts as [term, value] pairs, leaving out what it doesn't have. */
function ticketFacts(t) {
  const floorAndSeat = [t.floor_number != null && `Floor ${t.floor_number}`, t.seat_number && `Seat ${t.seat_number}`]
    .filter(Boolean)
    .join(' · ')
  return [
    ['Category', CATEGORIES[t.category]],
    ['Impact', SCOPES[t.affected_scope]],
    ['Building', t.building_name],
    floorAndSeat && ['Floor · Seat', floorAndSeat],
    ['Assigned engineer', t.assigned_to_name ?? 'Not assigned yet'],
    ['Created', formatDateTime(t.created_at)],
    ['Last updated', formatDateTime(t.updated_at)],
    t.resolved_at && ['Resolved', formatDateTime(t.resolved_at)],
  ].filter(Boolean)
}

function BackToAdminDashboard() {
  return <BackLink to="/admin">Back to admin dashboard</BackLink>
}

/** The back link as the mockup draws it: small, and underlined only on hover. */
function CompactBackLink() {
  return (
    <Box sx={{ flex: 'none', fontSize: 13, fontWeight: 500, '& a': { textDecoration: 'none' }, '& a:hover': { textDecoration: 'underline' } }}>
      <BackToAdminDashboard />
    </Box>
  )
}

function NotFound() {
  return (
    <Stack spacing={2}>
      <BackToAdminDashboard />
      <Card>
        <CardContent>
          <Typography variant="h4" component="h1" gutterBottom>
            Ticket not found
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            There&apos;s no ticket with this number.
          </Typography>
          <Button variant="contained" component={RouterLink} to="/admin">
            Go to the admin dashboard
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
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, px: 2, pt: 1.75, pb: 1.25 }}>
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
        border: `1px solid ${ESCALATED}`,
        color: ESCALATED,
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

/** "#12", priority, status, escalation and who opened it, above the title. */
function MetaRow({ ticket: t, showCreated }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, fontSize: 13, color: 'text.secondary' }}>
      {/* The number is also in the heading, for screen readers. */}
      <Box component="span" aria-hidden="true" sx={{ fontWeight: 600, color: 'primary.main' }}>
        #{t.ticket_id}
      </Box>
      <PriorityPill priority={t.priority} />
      <StatusPill status={t.status} />
      {t.escalation_requested && <EscalatedPill />}
      {showCreated && (
        <span>
          Created {ago(t.created_at)} by {t.created_by_name}
        </span>
      )}
    </Box>
  )
}

MetaRow.propTypes = {
  ticket: ticketShape.isRequired,
  showCreated: PropTypes.bool.isRequired,
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
 * Open -> In progress -> Resolved -> Closed across the header, with no dates. Blocked is a
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
                  sx={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  <Box component="span" sx={{ fontWeight: 600, color: ESCALATED }}>
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
  const where = blocked ? `Blocked${blockedReason ? `: ${blockedReason}` : ''}` : STATUSES[status].label
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
      <Typography aria-hidden="true" sx={{ fontSize: 12, color: 'text.secondary', overflowWrap: 'anywhere' }}>
        Step {at + 1} of {steps.length} · {where}
      </Typography>
    </>
  )
}

ProgressBars.propTypes = ProgressSteps.propTypes

/**
 * Closing or sending back a resolved ticket: both ask for text first (a note, or what's
 * still wrong). On larger screens the buttons sit top right of the header and the hint
 * beside the progress steps (the section is `display: contents`, so both are header grid
 * cells). On phones the buttons are pinned to the bottom of the screen.
 */
function FinishTicketControls({ ticket, phone, onFinished }) {
  const [asking, setAsking] = useState(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const resolved = ticket.status === 'resolved'

  const finish = async (action, reason) => {
    setSending(true)
    setError('')
    try {
      const updated = await finishTicket(ticket.ticket_id, action.to, reason)
      setAsking(null)
      setNotice(action.done(updated))
      onFinished(updated)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const buttonHeight = phone ? 44 : 36
  const buttons = resolved && (
    <Stack direction="row" spacing={1} sx={phone ? undefined : { gridArea: 'actions', justifySelf: { md: 'end' } }}>
      <Button
        variant="outlined"
        startIcon={phone ? null : <UndoIcon />}
        onClick={() => setAsking(FINISH_ACTIONS.sendBack)}
        sx={{ height: buttonHeight, flex: phone ? 1 : 'none', whiteSpace: 'nowrap' }}
      >
        Send back…
      </Button>
      <Button
        variant="contained"
        startIcon={phone ? null : <TaskAltIcon />}
        onClick={() => setAsking(FINISH_ACTIONS.close)}
        sx={{ height: buttonHeight, flex: phone ? 1 : 'none', whiteSpace: 'nowrap' }}
      >
        Close ticket…
      </Button>
    </Stack>
  )
  const confirmation = notice && (
    <Alert severity="success" onClose={() => setNotice('')} sx={{ py: 0 }}>
      {notice}
    </Alert>
  )
  const dialog = asking && (
    <ReasonDialog
      title={asking.title}
      label={asking.label}
      hint={asking.hint}
      required={asking.required}
      sending={sending}
      error={error}
      onCancel={() => {
        setAsking(null)
        setError('')
      }}
      onConfirm={(reason) => finish(asking, reason)}
    />
  )

  if (phone) {
    if (!resolved && !notice) return dialog
    return (
      <Stack
        component="section"
        aria-label="Finish ticket"
        spacing={1}
        sx={{
          position: 'sticky',
          bottom: 0,
          zIndex: 1,
          mx: -2,
          px: 2,
          py: 1.25,
          bgcolor: 'background.paper',
          borderTop: 1,
          borderColor: 'divider',
        }}
      >
        {confirmation}
        {buttons}
        {dialog}
      </Stack>
    )
  }

  return (
    <Box component="section" aria-label="Finish ticket" sx={{ display: 'contents' }}>
      {buttons}
      <Stack spacing={0.75} sx={{ gridArea: 'hint', maxWidth: { md: 280 } }}>
        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{finishHint(ticket.status)}</Typography>
        {confirmation}
      </Stack>
      {dialog}
    </Box>
  )
}

FinishTicketControls.propTypes = {
  ticket: ticketShape.isRequired,
  phone: PropTypes.bool.isRequired,
  onFinished: PropTypes.func.isRequired,
}

/** The desktop header: meta and title, close actions top right, progress along the bottom. */
function TicketHeader({ ticket: t, onFinished }) {
  return (
    <Card
      sx={{
        flex: 'none',
        px: 2.5,
        py: 2,
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'minmax(0,1fr) auto' },
        gridTemplateAreas: {
          xs: '"title" "actions" "rule" "steps" "hint"',
          md: '"title actions" "rule rule" "steps hint"',
        },
        alignItems: 'center',
        columnGap: 3,
        rowGap: 1.5,
      }}
    >
      <Stack spacing={0.75} sx={{ gridArea: 'title', minWidth: 0 }}>
        <MetaRow ticket={t} showCreated />
        <TicketTitle ticket={t} fontSize={22} />
      </Stack>
      <Box aria-hidden="true" sx={{ gridArea: 'rule', borderTop: 1, borderColor: 'divider' }} />
      <ProgressSteps status={t.status} blockedReason={t.blocked_reason} />
      <FinishTicketControls ticket={t} phone={false} onFinished={onFinished} />
    </Card>
  )
}

TicketHeader.propTypes = {
  ticket: ticketShape.isRequired,
  onFinished: PropTypes.func.isRequired,
}

/** The employee's reason for asking an admin to look at the ticket. */
function EscalationAlert({ ticket: t }) {
  return (
    <Alert
      severity="warning"
      sx={{ py: 0, px: 1.25, fontSize: 13, '& .MuiAlert-icon': { fontSize: 18, mr: 1 } }}
    >
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
    <Box
      component="dl"
      sx={{ m: 0, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 2, rowGap: 1.5 }}
    >
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
 * Every note, newest first, with the author's initials, name ("You" for the signed-in
 * admin) and role. Staff get a blue avatar. Read-only.
 */
function NoteFeed({ notes }) {
  const { user } = useAuth()
  const placeholder = listPlaceholder(notes, 'notes', 'No notes yet.')
  if (placeholder) return <Box sx={{ px: 2.5, pb: 2 }}>{placeholder}</Box>

  return (
    <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, flex: 1, minHeight: 0, ...SCROLL_SX }}>
      {[...notes.data].reverse().map((note) => {
        const staff = note.author_role !== 'employee'
        return (
          <Box
            component="li"
            key={note.note_id}
            sx={{
              display: 'grid',
              gridTemplateColumns: '32px minmax(0,1fr)',
              gap: 1.25,
              px: 2.5,
              py: 1.25,
              borderTop: 1,
              borderColor: 'divider',
            }}
          >
            <Avatar
              aria-hidden="true"
              sx={{
                width: 32,
                height: 32,
                fontSize: 12,
                fontWeight: 600,
                bgcolor: staff ? 'primary.main' : '#E6F0F8',
                color: staff ? 'common.white' : 'secondary.main',
              }}
            >
              {initials(note.author_name)}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 0.75 }}>
                <Typography component="span" sx={{ fontSize: 13, fontWeight: 600 }}>
                  {note.user_id === user.user_id ? 'You' : note.author_name}
                </Typography>
                <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary' }}>
                  {ROLES[note.author_role]} · {ago(note.created_at)}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: 14, lineHeight: 1.45, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {note.note_text}
              </Typography>
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

NoteFeed.propTypes = {
  notes: listShape.isRequired,
}

/** Every status change, newest first: what it became, who did it and why, and when. */
function HistoryFeed({ history }) {
  const { user } = useAuth()
  const placeholder = listPlaceholder(history, 'status history', 'No status changes yet.')
  if (placeholder) return placeholder

  return (
    <Stack component="ol" aria-label="Status history" spacing={1} sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {[...history.data].reverse().map((change) => {
        const who = change.changed_by_user_id === user.user_id ? 'You' : change.changed_by_name
        return (
          <Box
            component="li"
            key={change.history_id}
            sx={{ display: 'grid', gridTemplateColumns: '10px minmax(0,1fr) auto', gap: 1.25, alignItems: 'start' }}
          >
            <Box
              aria-hidden="true"
              sx={{ width: 10, height: 10, mt: '4px', borderRadius: '50%', bgcolor: STATUSES[change.to_status].dot }}
            />
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 500, lineHeight: 1.35 }}>{describeStatusChange(change).label}</Typography>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {who}
                {change.reason && ` · ${change.reason}`}
              </Typography>
            </Box>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap' }}>
              {formatDateTime(change.changed_at)}
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

/** The engineer on the ticket, with the form to assign or reassign it. */
function AssignmentSection({ ticket, engineers, onAssigned }) {
  return (
    <Section title="Assignment">
      {/* The mockup's dense sizes: 14px text and 40px controls (MUI's small size). */}
      <Box
        sx={{
          px: 2,
          pb: 1.75,
          '& .MuiTypography-root': { fontSize: 13 },
          '& .MuiStack-root > :not(style) ~ :not(style)': { mt: 1 },
          '& .MuiInputBase-root': { fontSize: 14 },
          '& .MuiSelect-select': { py: 1 },
          '& .MuiInputLabel-root:not(.MuiInputLabel-shrink)': { transform: 'translate(14px, 9px) scale(1)' },
          '& .MuiButton-root': { height: 40 },
        }}
      >
        <TicketAssignment ticket={ticket} engineers={engineers} onAssigned={onAssigned} />
      </Box>
    </Section>
  )
}

AssignmentSection.propTypes = {
  ticket: ticketShape.isRequired,
  engineers: PropTypes.object.isRequired,
  onAssigned: PropTypes.func.isRequired,
}

/** Who reported the ticket, with their email and phone as links. */
function RequesterSection({ ticket: t }) {
  return (
    <Section title="Requester">
      <Box sx={{ px: 2, pb: 1.75, display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Avatar
          aria-hidden="true"
          sx={{ width: 32, height: 32, fontSize: 12, fontWeight: 600, bgcolor: '#E6F0F8', color: 'secondary.main' }}
        >
          {initials(t.created_by_name)}
        </Avatar>
        <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', fontSize: 13, lineHeight: 1.4 }}>
          <Typography component="span" sx={{ fontSize: 14, fontWeight: 600 }}>
            {t.created_by_name}
          </Typography>
          <Link href={`mailto:${t.created_by_email}`} underline="hover" sx={{ overflowWrap: 'anywhere' }}>
            {t.created_by_email}
          </Link>
          {t.created_by_phone ? (
            <Link href={`tel:${t.created_by_phone.replace(/[^\d+]/g, '')}`} underline="hover" color="text.secondary">
              {t.created_by_phone}
            </Link>
          ) : (
            <Typography component="span" sx={{ fontSize: 13, color: 'text.secondary' }}>
              No phone number given
            </Typography>
          )}
        </Box>
      </Box>
    </Section>
  )
}

RequesterSection.propTypes = {
  ticket: ticketShape.isRequired,
}

/**
 * Large screens: header on top, then Details | Notes | (Assignment, Requester, Status
 * history), all in one screen with no page scroll. Smaller screens stack them.
 */
function DesktopLayout({ ticket: t, history, notes, engineers, onAssigned, onFinished }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: GAP,
        '@media (min-width: 1200px)': FILL_FRAME_SX,
      }}
    >
      <CompactBackLink />
      <TicketHeader ticket={t} onFinished={onFinished} />

      <Box
        sx={{
          flex: { lg: 1 },
          minHeight: 0,
          display: 'grid',
          gap: GAP,
          gridTemplateColumns: {
            xs: 'minmax(0,1fr)',
            md: 'repeat(2, minmax(0,1fr))',
            lg: 'minmax(0,1fr) minmax(0,1fr) 400px',
          },
          gridTemplateRows: { lg: 'minmax(0,1fr)' },
        }}
      >
        <Section title="Details">
          <Box sx={{ px: 2.5, pb: 2, ...SCROLL_SX }}>
            <DetailsBody ticket={t} />
          </Box>
        </Section>

        <Section title="Notes" aside={notes.data && `${notes.data.length} · newest first`}>
          <NoteFeed notes={notes} />
        </Section>

        <Box
          sx={{
            gridColumn: { md: '1 / -1', lg: 'auto' },
            minHeight: 0,
            display: 'grid',
            gap: GAP,
            gridTemplateColumns: { md: 'repeat(3, minmax(0,1fr))', lg: 'minmax(0,1fr)' },
            gridTemplateRows: { lg: 'auto auto minmax(0,1fr)' },
          }}
        >
          <AssignmentSection ticket={t} engineers={engineers} onAssigned={onAssigned} />
          <RequesterSection ticket={t} />
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
  engineers: PropTypes.object.isRequired,
  onAssigned: PropTypes.func.isRequired,
  onFinished: PropTypes.func.isRequired,
}

const PHONE_TABS = ['details', 'notes', 'history']

/** Phones: the summary and progress on top, then Details / Notes / History tabs. */
function PhoneLayout({ ticket: t, history, notes, engineers, onAssigned, onFinished }) {
  const [tab, setTab] = useState('details')
  const labels = {
    details: 'Details',
    notes: notes.data ? `Notes (${notes.data.length})` : 'Notes',
    history: 'History',
  }

  return (
    <Stack spacing={GAP}>
      <BackToAdminDashboard />
      <Card sx={{ px: 2, py: 1.5 }}>
        <Stack spacing={1}>
          <MetaRow ticket={t} showCreated={false} />
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
            <Card sx={{ p: 2 }}>
              <DetailsBody ticket={t} />
            </Card>
            <AssignmentSection ticket={t} engineers={engineers} onAssigned={onAssigned} />
            <RequesterSection ticket={t} />
          </Stack>
        )}
        {tab === 'notes' && (
          <Card sx={{ '& li:first-of-type': { borderTop: 0 } }}>
            <NoteFeed notes={notes} />
          </Card>
        )}
        {tab === 'history' && (
          <Card sx={{ p: 2 }}>
            <HistoryFeed history={history} />
          </Card>
        )}
      </Box>

      <FinishTicketControls ticket={t} phone onFinished={onFinished} />
    </Stack>
  )
}

PhoneLayout.propTypes = DesktopLayout.propTypes

/**
 * Any ticket, as a Facility Admin sees it, fitted to one screen on desktop: priority and
 * status, where it is in the workflow (and closing or sending back a resolved ticket), its
 * details, every note, who owns it (and assigning it), who reported it, and its history.
 */
function AdminTicketDetailsPage() {
  const { ticketId } = useParams()
  const phone = useIsMobile()
  const validId = /^[1-9]\d{0,9}$/.test(ticketId)
  const ticket = useApiData(getTicket, { ticketId }, { skip: !validId })
  const history = useApiData(listTicketHistory, { ticketId }, { skip: !validId })
  const notes = useApiData(listTicketNotes, { ticketId }, { skip: !validId })
  const engineers = useApiData(listEngineers, {}, { skip: !validId })

  if (!validId || ticket.error?.status === 404) return <NotFound />
  if (ticket.error) {
    return (
      <Stack spacing={2}>
        <BackToAdminDashboard />
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

  const Layout = phone ? PhoneLayout : DesktopLayout
  return (
    <Layout
      ticket={ticket.data}
      history={history}
      notes={notes}
      engineers={engineers}
      // The new engineer shows in the facts, and the engineers' loads have changed.
      onAssigned={() => {
        ticket.reload()
        engineers.reload()
      }}
      // Closing or sending back moves the workflow and the history, and the engineer's load.
      onFinished={() => {
        ticket.reload()
        history.reload()
        engineers.reload()
      }}
    />
  )
}

export default AdminTicketDetailsPage
