import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import CheckIcon from '@mui/icons-material/Check'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
import PauseIcon from '@mui/icons-material/Pause'
import PriorityHighIcon from '@mui/icons-material/PriorityHigh'
import SendIcon from '@mui/icons-material/Send'
import { Link as RouterLink, useLocation, useParams } from 'react-router'

import useAuth from '../auth/useAuth'
import { panelHeadingSx, visuallyHiddenSx } from '../components/admin/panelStyles'
import { StatusPill } from '../components/admin/TicketPills'
import BackLink from '../components/BackLink'
import ErrorState from '../components/ErrorState'
import useApiData from '../hooks/useApiData'
import useIsMobile from '../hooks/useIsMobile'
import { ApiError } from '../services/apiClient'
import { addNote, getMyTicket, listNotes, listStatusHistory, requestEscalation } from '../services/ticketService'
import { CATEGORIES, formatAge, formatDateTime, ROLES, SCOPES, STATUSES } from '../utils/ticketFormat'
import { MAIN_PATH, workflowState } from '../utils/ticketWorkflow'

// AppLayout puts this page in a 1200px column under the 48px header, with 16px of padding
// above and below. On large screens the page breaks out to the full window width (24px
// gutters), trims the top padding to 12px, and takes exactly the height that's left, so
// nothing scrolls but the panels.
const FULL_WIDTH_SX = {
  mx: 'calc(50% - 50vw + 24px)',
  mt: -0.5,
  height: 'calc(100dvh - 76px)',
  minHeight: 560,
}
// Phones: the screen less the 48px header and the layout's 16px padding above and below.
const PHONE_MIN_HEIGHT = 'calc(100dvh - 80px)'
const GAP = 1.5
const MUTED = 'rgba(0,0,0,.15)'
const BLOCKED = STATUSES.blocked.dot
// Red for escalation, from the mockup; passes AA contrast on white and on its tint.
const ESCALATED = '#B3261E'
const ESCALATED_TINT = '#FDECEA'
const NOTE_LIMIT = 2000
const REASON_LIMIT = 1000

/**
 * A panel body that scrolls, with a soft shadow along an edge while there's more to
 * scroll that way. CSS only: the white covers scroll with the content (`local`) and hide
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

// Read by screen readers after each step's name, e.g. "Open (done)".
const STATE_TEXT = {
  done: 'done',
  current: 'current status',
  paused: 'paused while blocked',
  blocked: 'current status',
  optional: 'only if something holds it up',
  upcoming: 'not reached yet',
}

const ticketShape = PropTypes.shape({
  ticket_id: PropTypes.number.isRequired,
  title: PropTypes.string.isRequired,
  description: PropTypes.string.isRequired,
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
  created_at: PropTypes.string.isRequired,
  updated_at: PropTypes.string.isRequired,
})

const listShape = PropTypes.shape({
  data: PropTypes.array,
  loading: PropTypes.bool.isRequired,
  error: PropTypes.instanceOf(Error),
  reload: PropTypes.func.isRequired,
})

const stepShape = PropTypes.shape({
  status: PropTypes.string.isRequired,
  state: PropTypes.oneOf(Object.keys(STATE_TEXT)).isRequired,
  when: PropTypes.string.isRequired,
  reason: PropTypes.string,
})

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

/** The most recent move into `status`, from the oldest-first history. */
function lastMoveTo(history, status) {
  return [...history].reverse().find((change) => change.to_status === status)
}

/**
 * Open -> In Progress -> Blocked -> Resolved -> Closed, each with when (and by whom) it
 * happened, so the progress doubles as the status history. Blocked stays an optional
 * side state: it's never "done", only current (with the engineer's reason) or optional.
 * A step also carries the reason given for that move, if any: the engineer's "What did
 * you do?" on Resolved, the admin's "What's still wrong?" on a reopen, a closing note.
 * @returns {Array<{status: string, state: string, when: string, reason?: string}>}
 */
function progressSteps(ticket, history, userId) {
  const { steps, blocked } = workflowState(ticket.status)
  const changes = history ?? []
  const who = (change) => (change.changed_by_user_id === userId ? 'You' : change.changed_by_name)

  const whenFor = (status) => {
    const move = lastMoveTo(changes, status)
    // The first row is the ticket's creation (from_status null); any later move to Open reopened it.
    if (status === 'open' && !move?.from_status) return `Received ${formatDateTime(ticket.created_at)}`
    if (!move) return ''
    const at = formatDateTime(move.changed_at)
    if (status === 'open') return `Reopened ${at}`
    if (status === 'in_progress') {
      if (move.from_status === 'blocked') return `Work resumed ${at}`
      if (move.from_status === 'open') return `${who(move)} started ${at}`
      return `Reopened ${at}`
    }
    if (status === 'resolved') return `${who(move)} resolved it ${at}`
    return `${who(move)} closed it ${at}`
  }

  const main = steps.map((step) => {
    if (step.state === 'upcoming') return { ...step, when: '—' }
    const reason = lastMoveTo(changes, step.status)?.reason
    return { ...step, when: whenFor(step.status), ...(reason && { reason }) }
  })

  const lastBlock = lastMoveTo(changes, 'blocked')
  let blockedWhen = 'Only if something holds it up'
  if (blocked) {
    blockedWhen = [ticket.blocked_reason, lastBlock && `since ${formatDateTime(lastBlock.changed_at)}`]
      .filter(Boolean)
      .join(' · ')
  } else if (lastBlock) {
    blockedWhen = `Was blocked ${formatDateTime(lastBlock.changed_at)}`
  }
  const blockedStep = { status: 'blocked', state: blocked ? 'blocked' : 'optional', when: blockedWhen }

  return [...main.slice(0, 2), blockedStep, ...main.slice(2)]
}

/** "In Progress since Sep 22, 11:05 AM · Next: Resolved", for the phone's summary. */
function whereNow(ticket, history) {
  const { status } = ticket
  if (status === 'blocked') return `Blocked${ticket.blocked_reason ? `: ${ticket.blocked_reason}` : ''}`
  const move = lastMoveTo(history ?? [], status)
  const since = move ? ` since ${formatDateTime(move.changed_at)}` : ''
  const next = MAIN_PATH[MAIN_PATH.indexOf(status) + 1]
  return `${STATUSES[status].label}${since}${next ? ` · Next: ${STATUSES[next].label}` : ''}`
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
    ['Created', formatDateTime(t.created_at)],
    ['Last update', ago(t.updated_at)],
  ].filter(Boolean)
}

/** Loading, failure or "none yet" for a list; null once there's something to show. */
function listPlaceholder(list, what, empty) {
  if (list.error) return <ErrorState message={list.error.message} onRetry={list.reload} />
  if (list.loading && !list.data) return <Skeleton variant="rounded" height={80} aria-label={`Loading ${what}`} />
  if (list.data.length === 0) return <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>{empty}</Typography>
  return null
}

function BackToDashboard() {
  return <BackLink to="/dashboard">Back to dashboard</BackLink>
}

/** The back link as the mockup draws it: small, and underlined only on hover. */
function CompactBackLink() {
  return (
    <Box
      sx={{
        flex: 'none',
        fontSize: 13,
        fontWeight: 500,
        '& a': { textDecoration: 'none' },
        '& a:hover': { textDecoration: 'underline' },
      }}
    >
      <BackToDashboard />
    </Box>
  )
}

function NotFound() {
  return (
    <Stack spacing={2}>
      <BackToDashboard />
      <Card>
        <CardContent>
          <Typography variant="h4" component="h1" gutterBottom>
            Ticket not found
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            It may not exist, or it belongs to someone else.
          </Typography>
          <Button variant="contained" component={RouterLink} to="/dashboard">
            Go to my dashboard
          </Button>
        </CardContent>
      </Card>
    </Stack>
  )
}

/** Confirms a ticket just created on the Create Ticket page, as a thin dismissible banner. */
function CreatedNotice({ phone }) {
  const created = useLocation().state?.createdTicket
  const [dismissed, setDismissed] = useState(false)
  if (!created || dismissed) return null
  return (
    <Alert
      severity="success"
      onClose={() => setDismissed(true)}
      // Desktop: fills the row beside the back link. Phone: its own row (flex: 1 there would
      // stretch it down the page's column).
      sx={{ flex: phone ? 'none' : 1, minWidth: 0, py: 0, alignItems: 'center', fontSize: phone ? 13 : 14 }}
    >
      Ticket created. We&apos;ll keep you posted here as it progresses.
    </Alert>
  )
}

CreatedNotice.propTypes = {
  phone: PropTypes.bool.isRequired,
}

/** A titled white card, labelled by its title for screen readers. May shrink and scroll. */
function Section({ title, aside = null, hideTitle = false, children, sx = {} }) {
  return (
    <Card component="section" aria-label={title} sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, ...sx }}>
      <Box
        sx={
          hideTitle
            ? visuallyHiddenSx
            : { display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 1, px: 2.5, pt: 1.75, pb: 1 }
        }
      >
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
  hideTitle: PropTypes.bool,
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

const isHere = (step) => step.state === 'current' || step.state === 'blocked'
const reached = (step) => !['upcoming', 'optional'].includes(step.state)

/** One step's round marker: a check when done, dots when current, pause when blocked. */
function StepDot({ state, size }) {
  const filled = ['done', 'current', 'paused'].includes(state)
  const Icon = { done: CheckIcon, current: MoreHorizIcon, paused: PauseIcon, blocked: PauseIcon }[state]
  const border = { optional: `1px dashed rgba(0,0,0,.38)`, upcoming: '1px solid rgba(0,0,0,.26)' }[state]
  return (
    <Box
      aria-hidden="true"
      sx={{
        width: size,
        height: size,
        flex: 'none',
        boxSizing: 'border-box',
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        bgcolor: filled ? 'primary.main' : state === 'blocked' ? BLOCKED : 'background.paper',
        color: 'common.white',
        border: border ?? 'none',
      }}
    >
      {Icon && <Icon sx={{ fontSize: size - 9 }} />}
    </Box>
  )
}

StepDot.propTypes = {
  state: PropTypes.oneOf(Object.keys(STATE_TEXT)).isRequired,
  size: PropTypes.number.isRequired,
}

/** A step's name, bold where the ticket is now, with its state for screen readers. */
function StepLabel({ step, fontSize }) {
  let color = reached(step) ? 'secondary.main' : 'text.secondary'
  if (step.state === 'blocked') color = ESCALATED
  return (
    <Typography
      component="span"
      sx={{
        fontSize,
        fontWeight: isHere(step) ? 700 : 500,
        color,
      }}
    >
      {STATUSES[step.status].label}
      <Box component="span" sx={visuallyHiddenSx}>
        {` (${STATE_TEXT[step.state]})`}
      </Box>
    </Typography>
  )
}

StepLabel.propTypes = {
  step: stepShape.isRequired,
  fontSize: PropTypes.number.isRequired,
}

/**
 * When a step happened, and the reason given for it in quotes. A dash for steps not reached
 * yet (the state text says so). `clamp` cuts a long reason to two lines, with the whole
 * reason in its tooltip, so the desktop header stays compact.
 */
function StepWhen({ step, clamp = false, sx = {} }) {
  return (
    <>
      <Typography
        component="span"
        aria-hidden={step.when === '—' ? 'true' : undefined}
        sx={{ fontSize: 12, color: 'text.secondary', overflowWrap: 'anywhere', ...sx }}
      >
        {step.when}
      </Typography>
      {step.reason && (
        <Typography
          component="span"
          title={clamp ? step.reason : undefined}
          sx={{
            fontSize: 12,
            color: 'rgba(0,0,0,.75)',
            overflowWrap: 'anywhere',
            ...(clamp && { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }),
            ...sx,
          }}
        >
          &ldquo;{step.reason}&rdquo;
        </Typography>
      )}
    </>
  )
}

StepWhen.propTypes = {
  step: stepShape.isRequired,
  clamp: PropTypes.bool,
  sx: PropTypes.object,
}


/**
 * The connector from step `index` to the next: orange into an active Blocked, blue once
 * the ticket has got past it (the line across an unused Blocked turns blue at Resolved).
 */
function connectorColor(steps, index) {
  const next = steps[index + 1]
  if (next.state === 'blocked') return BLOCKED
  const beyond = next.state === 'optional' ? steps[index + 2] : next
  return reached(beyond) ? 'primary.main' : MUTED
}

/**
 * Desktop progress: five columns, each a dot, a connector to the next, the step's name
 * and when it happened. Connectors next to Blocked are dashed, since it's optional.
 */
function ProgressSteps({ steps }) {
  return (
    <Box component="ol" aria-label="Ticket workflow" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex' }}>
      {steps.map((step, index) => {
        const next = steps[index + 1]
        const nearBlocked = step.status === 'blocked' || next?.status === 'blocked'
        return (
          <Box
            component="li"
            key={step.status}
            aria-current={isHere(step) ? 'step' : undefined}
            sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.75 }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <StepDot state={step.state} size={24} />
              {next && (
                <Box
                  aria-hidden="true"
                  sx={{
                    flex: 1,
                    mx: 1.25,
                    borderTop: `2px ${nearBlocked ? 'dashed' : 'solid'}`,
                    borderColor: connectorColor(steps, index),
                  }}
                />
              )}
            </Box>
            <StepLabel step={step} fontSize={13} />
            <StepWhen step={step} clamp sx={{ pr: 2 }} />
          </Box>
        )
      })}
    </Box>
  )
}

ProgressSteps.propTypes = {
  steps: PropTypes.arrayOf(stepShape).isRequired,
}

/** Phone progress tab: the same steps as a vertical list. */
function ProgressList({ steps }) {
  return (
    <Stack component="ol" aria-label="Ticket workflow" spacing={1.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {steps.map((step) => (
        <Box
          component="li"
          key={step.status}
          aria-current={isHere(step) ? 'step' : undefined}
          sx={{ display: 'grid', gridTemplateColumns: '20px minmax(0,1fr)', gap: 1.25, alignItems: 'start' }}
        >
          <StepDot state={step.state} size={20} />
          <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <StepLabel step={step} fontSize={14} />
            <StepWhen step={step} />
          </Box>
        </Box>
      ))}
    </Stack>
  )
}

ProgressList.propTypes = ProgressSteps.propTypes

/** The phone's summary progress: one short bar per main step, orange where it's paused. */
function ProgressBars({ status }) {
  const { steps } = workflowState(status)
  return (
    <Box aria-hidden="true" sx={{ display: 'flex', gap: 0.5 }}>
      {steps.map((step) => (
        <Box
          key={step.status}
          sx={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            bgcolor: { upcoming: 'rgba(0,0,0,.12)', paused: BLOCKED }[step.state] ?? 'primary.main',
          }}
        />
      ))}
    </Box>
  )
}

ProgressBars.propTypes = {
  status: PropTypes.oneOf(Object.keys(STATUSES)).isRequired,
}

/** "#12 Title", with the number in blue (desktop) or read aloud only (phone). */
function TicketTitle({ ticket: t, phone }) {
  return (
    <Typography
      component="h1"
      sx={{ m: 0, fontSize: phone ? 18 : 22, fontWeight: 600, lineHeight: 1.3, color: 'secondary.main' }}
    >
      <Box component="span" sx={phone ? visuallyHiddenSx : { color: 'primary.main' }}>
        #{t.ticket_id}
      </Box>{' '}
      {t.title}
    </Typography>
  )
}

TicketTitle.propTypes = {
  ticket: ticketShape.isRequired,
  phone: PropTypes.bool.isRequired,
}

/** Desktop header: number and title, status, impact, engineer, then the progress steps. */
function TicketHeader({ ticket: t, steps }) {
  return (
    <Card sx={{ flex: 'none', px: 2.5, py: 2, display: 'flex', flexDirection: 'column', gap: 1.75 }}>
      <Stack spacing={0.75}>
        <TicketTitle ticket={t} phone={false} />
        <Box
          sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 2, rowGap: 0.5, fontSize: 13, color: 'text.secondary' }}
        >
          <StatusPill status={t.status} />
          <span>Impact: {SCOPES[t.affected_scope]}</span>
          <span>Engineer: {t.assigned_to_name ?? 'Not assigned yet'}</span>
          {t.escalation_requested && <EscalatedPill />}
        </Box>
      </Stack>
      <Box component="section" aria-label="Progress" sx={{ pt: 1.75, borderTop: 1, borderColor: 'divider' }}>
        <ProgressSteps steps={steps} />
      </Box>
    </Card>
  )
}

TicketHeader.propTypes = {
  ticket: ticketShape.isRequired,
  steps: PropTypes.arrayOf(stepShape).isRequired,
}

/** The full description and the facts as a two-column description list. */
function DetailsBody({ ticket: t }) {
  return (
    <Stack spacing={1.5}>
      <Typography sx={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {t.description}
      </Typography>
      <Box
        component="dl"
        sx={{
          m: 0,
          pt: 1.5,
          borderTop: 1,
          borderColor: 'divider',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          columnGap: 2,
          rowGap: 1.5,
        }}
      >
        {ticketFacts(t).map(([term, value]) => (
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
    </Stack>
  )
}

DetailsBody.propTypes = {
  ticket: ticketShape.isRequired,
}

/**
 * The conversation, oldest first like a chat: the employee's own notes on the right in
 * blue, everyone else's on the left.
 */
function NoteBubbles({ notes, phone }) {
  const { user } = useAuth()
  const placeholder = listPlaceholder(notes, 'notes', 'No notes yet.')
  if (placeholder) return placeholder

  return (
    <Stack component="ol" spacing={1.25} sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {notes.data.map((note) => {
        const mine = note.user_id === user.user_id
        const who = mine ? 'You' : note.author_name
        return (
          <Box
            component="li"
            key={note.note_id}
            sx={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', gap: '3px' }}
          >
            <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary' }}>
              {who} · {ROLES[note.author_role]} ·{' '}
              <span title={formatDateTime(note.created_at)}>{ago(note.created_at)}</span>
            </Typography>
            <Typography
              sx={{
                maxWidth: phone ? '88%' : '85%',
                px: 1.5,
                py: 1,
                borderRadius: '10px',
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

function noteError(text) {
  if (!text.trim()) return 'Write a note first.'
  if (text.trim().length > NOTE_LIMIT) return `Use ${NOTE_LIMIT} characters or fewer.`
  return ''
}

/**
 * The one-line note box and Send button under the conversation; Enter sends. Closed
 * tickets get a line of text instead, since the API rejects notes.
 */
function NoteComposer({ ticket, phone, onAdded }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  if (ticket.status === 'closed') {
    return (
      <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
        This ticket is closed, so new notes can&apos;t be added.
      </Typography>
    )
  }

  const send = async () => {
    const problem = noteError(text)
    setError(problem)
    if (problem) return
    setSending(true)
    try {
      await addNote(ticket.ticket_id, text)
      setText('')
      onAdded()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const length = text.trim().length
  const height = phone ? 44 : 38
  return (
    <Box
      component="form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        send()
      }}
    >
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <TextField
          id="note-text"
          placeholder={phone ? 'Write a note…' : 'Add details, answer a question or tell the engineer what changed.'}
          size="small"
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            if (error) setError('')
          }}
          error={Boolean(error)}
          disabled={sending}
          fullWidth
          slotProps={{ htmlInput: { 'aria-label': 'Add a note' } }}
          sx={{ '& .MuiInputBase-root': { height, fontSize: phone ? 15 : 14 } }}
        />
        <Button
          type="submit"
          variant="contained"
          disabled={sending}
          aria-label={phone ? (sending ? 'Sending…' : 'Send') : undefined}
          startIcon={phone ? null : sending ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
          sx={{ flex: 'none', height, minWidth: phone ? height : undefined, px: phone ? 0 : 2 }}
        >
          {phone ? sending ? <CircularProgress size={18} color="inherit" /> : <SendIcon fontSize="small" /> : sending ? 'Sending…' : 'Send'}
        </Button>
      </Box>
      {(error || length > NOTE_LIMIT - 200) && (
        <Typography role={error ? 'alert' : undefined} sx={{ mt: 0.5, fontSize: 12, color: error ? 'error.main' : 'text.secondary' }}>
          {error || `${length}/${NOTE_LIMIT}`}
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

/**
 * Escalation, inline: when to use it, then a "What changed?" box and a red confirm. Once
 * escalated it shows the reason; closed tickets can't be escalated.
 */
function EscalationBody({ ticket, phone, onEscalated }) {
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  if (ticket.escalation_requested) {
    return (
      <Box sx={{ display: 'flex', gap: 1.25, bgcolor: ESCALATED_TINT, borderRadius: '6px', px: 1.5, py: 1.25 }}>
        <PriorityHighIcon aria-hidden="true" sx={{ fontSize: 18, color: ESCALATED }} />
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: 13, minWidth: 0 }}>
          <Box component="span" sx={{ fontWeight: 600, color: ESCALATED }}>
            Escalation requested
          </Box>
          {ticket.escalation_reason && (
            <Box component="span" sx={{ color: 'rgba(0,0,0,.75)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              &ldquo;{ticket.escalation_reason}&rdquo;
            </Box>
          )}
          <Box component="span" sx={{ color: 'text.secondary' }}>
            The facility admin has been notified.
          </Box>
        </Box>
      </Box>
    )
  }
  if (ticket.status === 'closed') {
    return <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Closed tickets can&apos;t be escalated.</Typography>
  }

  const height = phone ? 44 : 34
  const cancel = () => {
    setAsking(false)
    setError('')
  }
  const confirm = async (event) => {
    event.preventDefault()
    if (!reason.trim()) return setError('Tell the facility admin what changed.')
    if (reason.trim().length > REASON_LIMIT) return setError(`Use ${REASON_LIMIT} characters or fewer.`)
    setSending(true)
    try {
      await requestEscalation(ticket.ticket_id, reason)
      setAsking(false)
      setReason('')
      onEscalated()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSending(false)
    }
    return undefined
  }

  return (
    <Stack spacing={1.25}>
      <Typography sx={{ fontSize: 13, lineHeight: 1.5, color: 'rgba(0,0,0,.7)' }}>
        Only escalate if the issue has become more urgent, for example a deadline or more people affected. The
        facility admin will review it.
      </Typography>
      {asking ? (
        <Stack component="form" noValidate spacing={1} onSubmit={confirm}>
          <TextField
            id="escalation-reason"
            placeholder="What changed? e.g. Client presentation in 12B at 3pm"
            multiline
            minRows={3}
            maxRows={6}
            size="small"
            autoFocus
            value={reason}
            onChange={(event) => {
              setReason(event.target.value)
              if (error) setError('')
            }}
            error={Boolean(error)}
            helperText={error || `${reason.trim().length}/${REASON_LIMIT}`}
            disabled={sending}
            fullWidth
            slotProps={{ htmlInput: { 'aria-label': 'What changed?' } }}
            sx={{ '& .MuiInputBase-root': { fontSize: 14 } }}
          />
          <Stack direction="row" spacing={1}>
            <Button
              type="submit"
              variant="contained"
              color="error"
              disabled={sending}
              startIcon={sending ? <CircularProgress size={14} color="inherit" /> : null}
              sx={{ height, flex: phone ? 1 : 'none', bgcolor: ESCALATED, fontSize: 13 }}
            >
              {sending ? 'Sending…' : 'Escalate ticket'}
            </Button>
            <Button onClick={cancel} disabled={sending} sx={{ height, fontSize: 13 }}>
              Cancel
            </Button>
          </Stack>
        </Stack>
      ) : (
        <Button
          variant="outlined"
          color="error"
          startIcon={<PriorityHighIcon />}
          onClick={() => setAsking(true)}
          sx={{
            height,
            alignSelf: phone ? 'stretch' : 'flex-start',
            color: ESCALATED,
            borderColor: 'rgba(179,38,30,.6)',
            fontSize: phone ? 14 : 13,
          }}
        >
          {phone ? 'Escalate this ticket' : 'Escalate'}
        </Button>
      )}
    </Stack>
  )
}

EscalationBody.propTypes = {
  ticket: ticketShape.isRequired,
  phone: PropTypes.bool.isRequired,
  onEscalated: PropTypes.func.isRequired,
}

/**
 * Larger screens: back link and banner, the header with progress, then Details | Notes |
 * Escalation. On large screens it all fits one window and only the panels scroll.
 */
function DesktopLayout({ ticket: t, steps, notes, onChanged }) {
  // Like a chat, show the newest note: scroll the notes panel (not the page) to the bottom.
  const notesRef = useRef(null)
  const noteCount = notes.data?.length ?? 0
  useEffect(() => {
    const box = notesRef.current
    if (box) box.scrollTop = box.scrollHeight
  }, [noteCount])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: GAP, '@media (min-width: 1200px)': FULL_WIDTH_SX }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minHeight: 36 }}>
        <CompactBackLink />
        <CreatedNotice phone={false} />
      </Box>

      <TicketHeader ticket={t} steps={steps} />

      <Box
        sx={{
          flex: { lg: 1 },
          minHeight: 0,
          display: 'grid',
          gap: GAP,
          gridTemplateColumns: {
            xs: 'minmax(0,1fr)',
            md: 'repeat(2, minmax(0,1fr))',
            lg: 'minmax(0,1fr) minmax(0,1.15fr) 340px',
          },
          gridTemplateRows: { lg: 'minmax(0,1fr)' },
          alignItems: 'start',
        }}
      >
        <Section title="Details" sx={{ height: { lg: '100%' } }}>
          <Box sx={{ px: 2.5, pb: 2, ...SCROLL_SX }}>
            <DetailsBody ticket={t} />
          </Box>
        </Section>

        <Section
          title="Notes"
          aside="your conversation with the engineer"
          sx={{ height: { xs: 480, lg: '100%' } }}
        >
          <Box ref={notesRef} sx={{ flex: 1, minHeight: 0, px: 2.5, pt: 0.5, pb: 1.5, ...SCROLL_SX }}>
            <NoteBubbles notes={notes} phone={false} />
          </Box>
          <Box sx={{ flex: 'none', px: 1.5, py: 1.25, borderTop: 1, borderColor: 'divider' }}>
            <NoteComposer ticket={t} phone={false} onAdded={onChanged} />
          </Box>
        </Section>

        <Section title="Escalation" sx={{ gridColumn: { md: '1 / -1', lg: 'auto' }, maxHeight: { lg: '100%' } }}>
          <Box sx={{ px: 2, pb: 1.75, ...SCROLL_SX }}>
            <EscalationBody ticket={t} phone={false} onEscalated={onChanged} />
          </Box>
        </Section>
      </Box>
    </Box>
  )
}

DesktopLayout.propTypes = {
  ticket: ticketShape.isRequired,
  steps: PropTypes.arrayOf(stepShape).isRequired,
  history: listShape.isRequired,
  notes: listShape.isRequired,
  onChanged: PropTypes.func.isRequired,
}

const PHONE_TABS = ['notes', 'details', 'progress']

/**
 * Phones: the summary with a short progress bar on top, then Notes / Details / Progress
 * tabs. The note box is pinned to the bottom of the screen on the Notes tab.
 */
function PhoneLayout({ ticket: t, steps, history, notes, onChanged }) {
  const [tab, setTab] = useState('notes')
  const labels = {
    notes: notes.data ? `Notes (${notes.data.length})` : 'Notes',
    details: 'Details',
    progress: 'Progress',
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: GAP, minHeight: PHONE_MIN_HEIGHT }}>
      <BackToDashboard />
      <CreatedNotice phone />

      <Card sx={{ flex: 'none', px: 2, py: 1.5 }}>
        <Stack spacing={1}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <StatusPill status={t.status} />
            {t.escalation_requested && <EscalatedPill />}
            <Typography component="span" sx={{ ml: 'auto', fontSize: 12, color: 'text.secondary', textAlign: 'right' }}>
              {t.assigned_to_name ?? 'Not assigned yet'}
            </Typography>
          </Box>
          <TicketTitle ticket={t} phone />
          <ProgressBars status={t.status} />
          <Typography sx={{ fontSize: 12, color: 'text.secondary', overflowWrap: 'anywhere' }}>
            {whereNow(t, history.data)}
          </Typography>
        </Stack>
      </Card>

      <Card sx={{ flex: 'none' }}>
        <Tabs value={tab} onChange={(event, value) => setTab(value)} variant="fullWidth" aria-label="Ticket sections">
          {PHONE_TABS.map((key) => (
            <Tab key={key} value={key} label={labels[key]} id={`ticket-tab-${key}`} aria-controls={`ticket-panel-${key}`} />
          ))}
        </Tabs>
      </Card>

      <Box
        role="tabpanel"
        id={`ticket-panel-${tab}`}
        aria-labelledby={`ticket-tab-${tab}`}
        sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: GAP }}
      >
        {tab === 'notes' && (
          <Section title="Notes" hideTitle sx={{ flex: 1 }}>
            <Box sx={{ flex: 1, p: 2 }}>
              <NoteBubbles notes={notes} phone />
            </Box>
            <Box
              sx={{
                position: 'sticky',
                bottom: 0,
                zIndex: 1,
                px: 2,
                py: 1.25,
                bgcolor: 'background.paper',
                borderTop: 1,
                borderColor: 'divider',
              }}
            >
              <NoteComposer ticket={t} phone onAdded={onChanged} />
            </Box>
          </Section>
        )}
        {tab === 'details' && (
          <>
            <Section title="Details" hideTitle>
              <Box sx={{ p: 2 }}>
                <DetailsBody ticket={t} />
              </Box>
            </Section>
            <Section title="Escalation">
              <Box sx={{ px: 2.5, pb: 2 }}>
                <EscalationBody ticket={t} phone onEscalated={onChanged} />
              </Box>
            </Section>
          </>
        )}
        {tab === 'progress' && (
          <Section title="Progress" hideTitle>
            <Box sx={{ p: 2 }}>
              <ProgressList steps={steps} />
            </Box>
          </Section>
        )}
      </Box>
    </Box>
  )
}

PhoneLayout.propTypes = DesktopLayout.propTypes

/**
 * One of the employee's tickets, fitted to one screen on desktop: where it is in the
 * workflow and when each step happened, its details, the notes conversation with the
 * engineer, and escalation. Never shows priority.
 */
function TicketDetailsPage() {
  const { ticketId } = useParams()
  const { user } = useAuth()
  const phone = useIsMobile()
  const validId = /^[1-9]\d{0,9}$/.test(ticketId)
  const ticket = useApiData(getMyTicket, { ticketId }, { skip: !validId })
  const history = useApiData(listStatusHistory, { ticketId }, { skip: !validId })
  const notes = useApiData(listNotes, { ticketId }, { skip: !validId })

  if (!validId || ticket.error?.status === 404) return <NotFound />
  if (ticket.error) {
    return (
      <Stack spacing={2}>
        <BackToDashboard />
        <ErrorState message={ticket.error.message} onRetry={ticket.reload} />
      </Stack>
    )
  }
  if (!ticket.data) {
    return (
      <Stack spacing={GAP} aria-label="Loading ticket" aria-busy="true">
        <Skeleton variant="text" width={200} />
        <Skeleton variant="rounded" height={150} />
        <Skeleton variant="rounded" height={360} />
      </Stack>
    )
  }

  const t = ticket.data
  const Layout = phone ? PhoneLayout : DesktopLayout
  return (
    <Layout
      ticket={t}
      steps={progressSteps(t, history.data, user.user_id)}
      history={history}
      notes={notes}
      // Notes and escalation change updated_at (and the escalation flag), so refresh both.
      onChanged={() => {
        ticket.reload()
        notes.reload()
      }}
    />
  )
}

export default TicketDetailsPage
