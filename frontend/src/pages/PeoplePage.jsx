import { useState } from 'react'
import PropTypes from 'prop-types'
import { useMediaQuery } from 'react-responsive'
import { Link as RouterLink } from 'react-router'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import InputAdornment from '@mui/material/InputAdornment'
import LinearProgress from '@mui/material/LinearProgress'
import Link from '@mui/material/Link'
import Skeleton from '@mui/material/Skeleton'
import Snackbar from '@mui/material/Snackbar'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import LogoutIcon from '@mui/icons-material/Logout'
import SearchIcon from '@mui/icons-material/Search'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'

import RoleChangeDialog from '../components/admin/RoleChangeDialog'
import ErrorState from '../components/ErrorState'
import useApiData from '../hooks/useApiData'
import useDebouncedValue from '../hooks/useDebouncedValue'
import { listAllTickets } from '../services/adminTicketService'
import { listUsers } from '../services/adminUserService'
import { roleLabel } from '../utils/roles'
import { STATUSES } from '../utils/ticketFormat'

const ROLE_FILTERS = [
  ['', 'Everyone'],
  ['employee', 'Employees'],
  ['engineer', 'Engineers'],
  ['admin', 'Admins'],
]

// Below MUI's "md" (900px) the table and the side panel don't fit, so people are cards.
const STACKED_MAX_WIDTH = 899

// From md up the page fills the window below the header, so the table and the panel
// scroll inside themselves instead of the page. From lg (1200px) AppLayout's full-screen
// frame already sizes <main> to that space; between md and lg it doesn't, so subtract the
// 48px header and <main>'s top and bottom padding (16px each).
const FIT_HEIGHT = { md: 'calc(100dvh - 80px)', lg: '100%' }

// Name, email (lg+ only; the panel shows it otherwise), role, active tickets, change role.
const COLUMN_WIDTHS = { role: 124, tickets: 110, change: 164 }

const SELECTED_BG = '#F0F7FC'
const HEAD_BG = '#F5F9FC'

// The statuses that count as "active" in the API's active_ticket_count.
const ACTIVE_STATUSES = ['open', 'in_progress', 'blocked']

// Role chip and avatar colors, [background, text].
const ROLE_CHIP = {
  employee: ['#EEEEEE', '#424242'],
  engineer: ['#E6F0F8', '#003B70'],
  admin: ['#003B70', '#FFFFFF'],
}
const AVATAR = {
  employee: ['#E6F0F8', '#003B70'],
  engineer: ['#056DAE', '#FFFFFF'],
  admin: ['#003B70', '#FFFFFF'],
}
const STATUS_CHIP = {
  open: ['#E6F0F8', '#003B70'],
  in_progress: ['#FFF3E0', '#8A4B00'],
  blocked: ['#FDECEA', '#B3261E'],
}

const userShape = PropTypes.shape({
  user_id: PropTypes.number.isRequired,
  full_name: PropTypes.string.isRequired,
  email: PropTypes.string.isRequired,
  role: PropTypes.string.isRequired,
  active_ticket_count: PropTypes.number.isRequired,
})

const ticketShape = PropTypes.shape({
  ticket_id: PropTypes.number.isRequired,
  title: PropTypes.string.isRequired,
  status: PropTypes.string.isRequired,
})

/** Employees and engineers can be moved between each other; admins can't. */
const isChangeable = (user) => user.role === 'employee' || user.role === 'engineer'

/** The role a change button moves this person to. */
const otherRole = (user) => (user.role === 'employee' ? 'engineer' : 'employee')

/** "Make engineer" / "Make employee". */
const changeLabel = (user) => `Make ${otherRole(user)}`

/** "JD" for Jane Doe. */
const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * A person's active tickets: the ones assigned to an engineer, or the ones an employee
 * reported. Undefined while the tickets are still loading.
 * @param {object} user
 * @param {object[] | undefined} tickets every active ticket
 * @returns {object[] | undefined}
 */
function ticketsFor(user, tickets) {
  if (user.role === 'employee') {
    return tickets?.filter((t) => t.created_by_user_id === user.user_id)
  }
  return tickets?.filter((t) => t.assigned_to_user_id === user.user_id)
}

/**
 * How many active tickets a person has, for the table: "3 assigned", "1 reported",
 * "None", or "—" for admins. An engineer's count comes with the people list, so it
 * shows even before the tickets load.
 */
function ticketsText(user, count) {
  if (user.role === 'admin') return '—'
  const n = user.role === 'engineer' ? user.active_ticket_count : count
  if (n === undefined) return ''
  if (n === 0) return 'None'
  return `${n} ${user.role === 'engineer' ? 'assigned' : 'reported'}`
}

/** A small rounded label, e.g. a role or a ticket status. */
function Pill({ bg, fg, children, size = 'md' }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        flex: 'none',
        height: size === 'sm' ? 20 : 22,
        px: size === 'sm' ? 1 : 1.125,
        borderRadius: 11,
        bgcolor: bg,
        color: fg,
        fontSize: size === 'sm' ? 11 : 12,
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </Box>
  )
}

Pill.propTypes = {
  bg: PropTypes.string.isRequired,
  fg: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
  size: PropTypes.oneOf(['sm', 'md']),
}

/** A person's role as a colored pill. */
function RolePill({ role }) {
  const [bg, fg] = ROLE_CHIP[role] ?? ROLE_CHIP.employee
  return (
    <Pill bg={bg} fg={fg}>
      {roleLabel(role)}
    </Pill>
  )
}

RolePill.propTypes = { role: PropTypes.string.isRequired }

/** Round initials, colored by role. */
function Avatar({ user, size }) {
  const [bg, fg] = AVATAR[user.role] ?? AVATAR.employee
  return (
    <Box
      component="span"
      aria-hidden="true"
      sx={{
        width: size,
        height: size,
        flex: 'none',
        borderRadius: '50%',
        bgcolor: bg,
        color: fg,
        fontSize: Math.round(size * 0.34),
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {initials(user.full_name)}
    </Box>
  )
}

Avatar.propTypes = { user: userShape.isRequired, size: PropTypes.number.isRequired }

/** Role filter with a count on each option. Clicking the selected one keeps it. */
function RoleFilter({ value, counts, onChange, stacked }) {
  if (stacked) {
    return (
      <Box role="group" aria-label="Which people" sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 0.25 }}>
        {ROLE_FILTERS.map(([role, label]) => {
          const on = value === role
          return (
            <Button
              key={label}
              aria-pressed={on}
              onClick={() => onChange(role)}
              variant={on ? 'contained' : 'outlined'}
              color={on ? 'primary' : 'inherit'}
              sx={{
                flex: 'none',
                height: 36,
                px: 1.5,
                borderRadius: 18,
                fontSize: 13,
                gap: 0.75,
                bgcolor: on ? undefined : 'background.paper',
                borderColor: on ? undefined : 'rgba(0,0,0,.23)',
                color: on ? undefined : 'rgba(0,0,0,.75)',
              }}
            >
              {label}
              <Box component="span" sx={{ fontWeight: 500, opacity: 0.8 }}>
                {counts[role]}
              </Box>
            </Button>
          )
        })}
      </Box>
    )
  }

  return (
    <ToggleButtonGroup
      value={value}
      exclusive
      size="small"
      color="primary"
      aria-label="Which people"
      onChange={(_event, role) => role !== null && onChange(role)}
      sx={{ flex: 'none' }}
    >
      {ROLE_FILTERS.map(([role, label]) => (
        <ToggleButton key={label} value={role} sx={{ height: 34, px: 1.5, fontSize: 13, fontWeight: 600, gap: 0.75 }}>
          {label}
          <Box component="span" sx={{ fontSize: 12, fontWeight: 500, opacity: 0.75 }}>
            {counts[role]}
          </Box>
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  )
}

RoleFilter.propTypes = {
  value: PropTypes.string.isRequired,
  counts: PropTypes.objectOf(PropTypes.number).isRequired,
  onChange: PropTypes.func.isRequired,
  stacked: PropTypes.bool.isRequired,
}

/** Name or email search; the list refreshes once typing pauses. */
function SearchField({ value, onChange, stacked }) {
  return (
    <TextField
      type="search"
      size="small"
      placeholder="Search name or email"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      sx={{
        flex: 1,
        minWidth: 0,
        bgcolor: 'background.paper',
        '& .MuiInputBase-root': { height: stacked ? 44 : 34, fontSize: stacked ? 15 : 13 },
      }}
      slotProps={{
        htmlInput: { 'aria-label': 'Search' },
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon aria-hidden="true" sx={{ fontSize: stacked ? 20 : 18 }} />
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
  stacked: PropTypes.bool.isRequired,
}

/** "No one matches", with a way back to everyone. */
function NoMatches({ onClear }) {
  return (
    <Box sx={{ py: 4, px: 2, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
      <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>No one matches these filters.</Typography>
      <Button size="small" onClick={onClear}>
        Clear filters
      </Button>
    </Box>
  )
}

NoMatches.propTypes = { onClear: PropTypes.func.isRequired }

const headCellSx = {
  height: 32,
  py: 0,
  px: 1.5,
  bgcolor: HEAD_BG,
  fontSize: 12,
  fontWeight: 600,
  color: 'text.secondary',
  borderBottom: '1px solid rgba(0,0,0,.12)',
  borderTop: '1px solid rgba(0,0,0,.12)',
}

const bodyCellSx = {
  height: 48,
  py: 0,
  px: 1.5,
  fontSize: 13,
  borderBottom: '1px solid rgba(0,0,0,.08)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

/**
 * Desktop table: click a row to show that person in the panel. The change button opens
 * the confirm dialog for that row.
 */
function PeopleTable({ users, reported, selectedId, onSelect, onRequestChange }) {
  return (
    <Table stickyHeader size="small" aria-label="People" sx={{ tableLayout: 'fixed' }}>
      <TableHead>
        <TableRow>
          <TableCell sx={{ ...headCellSx, pl: 2 }}>Name</TableCell>
          <TableCell sx={{ ...headCellSx, display: { md: 'none', lg: 'table-cell' } }}>Email</TableCell>
          <TableCell sx={{ ...headCellSx, width: COLUMN_WIDTHS.role }}>Role</TableCell>
          <TableCell sx={{ ...headCellSx, width: COLUMN_WIDTHS.tickets }}>Active tickets</TableCell>
          <TableCell sx={{ ...headCellSx, width: COLUMN_WIDTHS.change, pr: 2, textAlign: 'right' }}>Change role</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {users.map((u) => {
          const selected = u.user_id === selectedId
          const count = reported && (reported.get(u.user_id) ?? 0)
          return (
            <TableRow
              key={u.user_id}
              hover
              selected={selected}
              onClick={() => onSelect(u.user_id)}
              sx={{
                cursor: 'pointer',
                '&.Mui-selected, &.Mui-selected:hover': { bgcolor: SELECTED_BG },
                '&:hover': { bgcolor: `${SELECTED_BG} !important` },
                boxShadow: selected ? 'inset 3px 0 0 #056DAE' : 'none',
              }}
            >
              <TableCell sx={{ ...bodyCellSx, pl: 2 }}>
                <ButtonBase
                  onClick={() => onSelect(u.user_id)}
                  aria-pressed={selected}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0, maxWidth: '100%', borderRadius: 1, justifyContent: 'flex-start' }}
                >
                  <Avatar user={u} size={30} />
                  <Box component="span" sx={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.full_name}
                  </Box>
                </ButtonBase>
              </TableCell>
              <TableCell sx={{ ...bodyCellSx, color: 'rgba(0,0,0,.65)', display: { md: 'none', lg: 'table-cell' } }}>
                {u.email}
              </TableCell>
              <TableCell sx={bodyCellSx}>
                <RolePill role={u.role} />
              </TableCell>
              <TableCell sx={{ ...bodyCellSx, color: ticketsText(u, count) === 'None' || u.role === 'admin' ? 'rgba(0,0,0,.45)' : 'text.primary' }}>
                {ticketsText(u, count)}
              </TableCell>
              <TableCell sx={{ ...bodyCellSx, pr: 2, textAlign: 'right', overflow: 'visible' }}>
                {isChangeable(u) ? (
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={(event) => {
                      event.stopPropagation()
                      onRequestChange(u)
                    }}
                    sx={{ height: 30, px: 1.5, fontSize: 13, whiteSpace: 'nowrap', borderColor: 'rgba(5,109,174,.5)' }}
                  >
                    {changeLabel(u)}
                  </Button>
                ) : (
                  <Box
                    component="span"
                    title="Admin accounts can't be changed here"
                    sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 12, color: 'rgba(0,0,0,.5)' }}
                  >
                    <LockOutlinedIcon aria-hidden="true" sx={{ fontSize: 16 }} />
                    Can&apos;t change
                  </Box>
                )}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

PeopleTable.propTypes = {
  users: PropTypes.arrayOf(userShape).isRequired,
  reported: PropTypes.instanceOf(Map),
  selectedId: PropTypes.number,
  onSelect: PropTypes.func.isRequired,
  onRequestChange: PropTypes.func.isRequired,
}

/** What changing this person's role will do, shown above the change button. */
function changeHint(user) {
  if (user.role === 'employee') {
    return 'As an engineer they can be assigned tickets. They keep the tickets they reported.'
  }
  if (user.active_ticket_count > 0) {
    return `Reassign their ${plural(user.active_ticket_count, 'active ticket')} first. Engineers with active tickets can't move back.`
  }
  return "They'll no longer appear in the assign list."
}

/**
 * The selected person: who they are, their active tickets, and the role change with a
 * warning that it signs them out.
 */
function PersonPanel({ user, tickets, ticketsError, onRetryTickets, onRequestChange }) {
  const title = user.role === 'employee' ? 'Their open tickets' : 'Assigned, active'
  const count = user.role === 'engineer' ? user.active_ticket_count : tickets?.length

  let ticketList
  if (ticketsError) {
    ticketList = (
      <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
        Couldn&apos;t load their tickets.{' '}
        <Link component="button" onClick={onRetryTickets} sx={{ fontSize: 13, verticalAlign: 'baseline' }}>
          Try again
        </Link>
      </Typography>
    )
  } else if (!tickets) {
    ticketList = <Skeleton variant="rounded" height={72} aria-label="Loading their tickets" />
  } else if (tickets.length === 0) {
    ticketList = <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Nothing active right now.</Typography>
  } else {
    ticketList = (
      <Box component="ul" aria-label={title} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {tickets.map((t) => {
          const [bg, fg] = STATUS_CHIP[t.status] ?? STATUS_CHIP.open
          return (
            <Box component="li" key={t.ticket_id}>
              <Link
                component={RouterLink}
                to={`/admin/tickets/${t.ticket_id}`}
                underline="none"
                color="inherit"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  py: 0.75,
                  fontSize: 13,
                  borderBottom: '1px solid rgba(0,0,0,.06)',
                  '&:hover .ticket-title': { textDecoration: 'underline' },
                }}
              >
                <Box component="span" sx={{ fontWeight: 600, color: 'primary.main' }}>
                  #{t.ticket_id}
                </Box>
                <Box className="ticket-title" component="span" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.title}
                </Box>
                <Pill bg={bg} fg={fg} size="sm">
                  {STATUSES[t.status]?.label ?? t.status}
                </Pill>
              </Link>
            </Box>
          )
        })}
      </Box>
    )
  }

  return (
    <Box
      component="section"
      aria-labelledby="person-name"
      sx={{
        bgcolor: 'background.paper',
        border: '1px solid rgba(0,0,0,.12)',
        borderRadius: 2,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0.75,
          pt: 2.5,
          pb: 2,
          px: 2,
          borderBottom: '1px solid rgba(0,0,0,.08)',
        }}
      >
        <Avatar user={user} size={56} />
        <Typography id="person-name" component="h2" sx={{ fontSize: 17, fontWeight: 600, color: 'secondary.main', textAlign: 'center' }}>
          {user.full_name}
        </Typography>
        <Link href={`mailto:${user.email}`} sx={{ fontSize: 13, overflowWrap: 'anywhere', textAlign: 'center' }}>
          {user.email}
        </Link>
        <RolePill role={user.role} />
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: 2, py: 1.75, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
          <Typography component="h3" sx={{ fontSize: 14, fontWeight: 600, color: 'secondary.main' }}>
            {title}
          </Typography>
          {count > 0 && <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{count}</Typography>}
        </Box>
        {ticketList}
        {user.role === 'engineer' && (
          <Link
            component={RouterLink}
            to={`/admin?engineer=${user.user_id}`}
            sx={{ fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 0.5, alignSelf: 'flex-start' }}
          >
            Open in admin dashboard
            <ArrowForwardIcon aria-hidden="true" sx={{ fontSize: 16 }} />
          </Link>
        )}
      </Box>

      <Box sx={{ flex: 'none', px: 2, py: 1.75, borderTop: '1px solid rgba(0,0,0,.12)', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {isChangeable(user) ? (
          <>
            <Box sx={{ display: 'flex', gap: 0.75, fontSize: 12, lineHeight: 1.4, color: 'rgba(0,0,0,.65)' }}>
              <InfoOutlinedIcon aria-hidden="true" sx={{ fontSize: 16, color: '#ED6C02', flex: 'none' }} />
              <span>{changeHint(user)}</span>
            </Box>
            <Box sx={{ display: 'flex', gap: 0.75, fontSize: 12, lineHeight: 1.4, color: '#8A4B00' }}>
              <LogoutIcon aria-hidden="true" sx={{ fontSize: 16, flex: 'none' }} />
              <span>Changing their role signs them out.</span>
            </Box>
            <Button
              variant="contained"
              startIcon={<SwapHorizIcon aria-hidden="true" />}
              onClick={() => onRequestChange(user)}
              sx={{ height: 38, fontSize: 14, '&:hover': { bgcolor: 'secondary.main' } }}
            >
              {changeLabel(user)}
            </Button>
          </>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 13, color: 'text.secondary' }}>
            <LockOutlinedIcon aria-hidden="true" sx={{ fontSize: 16 }} />
            {roleLabel('admin')} accounts can&apos;t be changed here.
          </Box>
        )}
      </Box>
    </Box>
  )
}

PersonPanel.propTypes = {
  user: userShape.isRequired,
  tickets: PropTypes.arrayOf(ticketShape),
  ticketsError: PropTypes.bool.isRequired,
  onRetryTickets: PropTypes.func.isRequired,
  onRequestChange: PropTypes.func.isRequired,
}

/** Phone and tablet: one compact card per person, with the change button on the right. */
function PeopleCards({ users, reported, onRequestChange }) {
  return (
    <Box component="ul" aria-label="People" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
      {users.map((u) => (
        <Box
          component="li"
          key={u.user_id}
          sx={{
            bgcolor: 'background.paper',
            border: '1px solid rgba(0,0,0,.12)',
            borderRadius: 2,
            py: 1.25,
            px: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
          }}
        >
          <Avatar user={u} size={36} />
          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {u.full_name}
            </Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {u.email}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 12, color: 'text.secondary' }}>
              <RolePill role={u.role} />
              {u.role !== 'admin' && ticketsText(u, reported && (reported.get(u.user_id) ?? 0))}
            </Box>
          </Box>
          {isChangeable(u) ? (
            <Button
              variant="outlined"
              aria-label={`Make ${u.full_name} ${u.role === 'employee' ? 'an engineer' : 'an employee'}`}
              onClick={() => onRequestChange(u)}
              sx={{ flex: 'none', height: 44, px: 1.5, fontSize: 13, whiteSpace: 'nowrap', borderColor: 'rgba(5,109,174,.5)' }}
            >
              → {roleLabel(otherRole(u))}
            </Button>
          ) : (
            <Box component="span" title="Can't change" sx={{ display: 'flex', p: 1.5, color: 'rgba(0,0,0,.4)' }}>
              <LockOutlinedIcon aria-label="Can't change" sx={{ fontSize: 18 }} />
            </Box>
          )}
        </Box>
      ))}
    </Box>
  )
}

PeopleCards.propTypes = {
  users: PropTypes.arrayOf(userShape).isRequired,
  reported: PropTypes.instanceOf(Map),
  onRequestChange: PropTypes.func.isRequired,
}

/**
 * Facility Admin people page, sized to fit the screen: a role filter (with counts) and
 * search on one row, a table of everyone, and a panel for the selected person with their
 * active tickets and the role change. Phones get compact cards instead. Each change is
 * confirmed first, since it signs that person out.
 */
function PeoplePage() {
  const stacked = useMediaQuery({ maxWidth: STACKED_MAX_WIDTH })
  const [role, setRole] = useState('')
  const [q, setQ] = useState('')
  const search = useDebouncedValue(q.trim(), 300)
  // Everyone matching the search; the role filter runs here so each option can show a count.
  const people = useApiData(listUsers, { q: search || undefined })
  // Every active ticket, to list the selected person's and count what employees reported.
  const tickets = useApiData(listAllTickets, { view: 'active' })
  const [selectedId, setSelectedId] = useState(null)
  // The change being confirmed, and a counter so each dialog starts fresh.
  const [change, setChange] = useState(null)
  const [changeCount, setChangeCount] = useState(0)
  const [notice, setNotice] = useState('')

  const users = people.data ?? []
  const rows = role ? users.filter((u) => u.role === role) : users
  const counts = Object.fromEntries(
    ROLE_FILTERS.map(([r]) => [r, r ? users.filter((u) => u.role === r).length : users.length]),
  )
  const activeTickets = tickets.data?.filter((t) => ACTIVE_STATUSES.includes(t.status))
  const reported = activeTickets && new Map()
  activeTickets?.forEach((t) => reported.set(t.created_by_user_id, (reported.get(t.created_by_user_id) ?? 0) + 1))

  // The picked person while they're in the list, otherwise the first one who can be changed.
  const selected =
    rows.find((u) => u.user_id === selectedId) ?? rows.find(isChangeable) ?? rows[0] ?? null

  const clearFilters = () => {
    setRole('')
    setQ('')
  }

  const requestChange = (user) => {
    setSelectedId(user.user_id)
    setChange({ user, role: otherRole(user) })
    setChangeCount((n) => n + 1)
  }

  const handleChanged = (user) => {
    setChange(null)
    setNotice(`${user.full_name} is now ${user.role === 'engineer' ? 'an engineer' : 'an employee'}. They'll need to sign in again.`)
    people.reload()
    tickets.reload()
  }

  const footer = search
    ? `${rows.length} of ${plural(users.length, 'person')} matching "${search}"`
    : `${rows.length} of ${users.length} people`

  let body
  if (people.error) {
    body = (
      <Box sx={{ p: 2 }}>
        <ErrorState message={people.error.message} onRetry={people.reload} />
      </Box>
    )
  } else if (!people.data) {
    body = <Skeleton variant="rounded" height={stacked ? 240 : '100%'} aria-label="Loading people" sx={{ m: stacked ? 0 : 2 }} />
  } else if (rows.length === 0) {
    body = <NoMatches onClear={clearFilters} />
  } else if (stacked) {
    body = <PeopleCards users={rows} reported={reported} onRequestChange={requestChange} />
  } else {
    body = (
      <PeopleTable
        users={rows}
        reported={reported}
        selectedId={selected?.user_id}
        onSelect={setSelectedId}
        onRequestChange={requestChange}
      />
    )
  }

  const dialogs = (
    <>
      <RoleChangeDialog key={changeCount} change={change} onClose={() => setChange(null)} onChanged={handleChanged} />
      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={5000}
        onClose={() => setNotice('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled" onClose={() => setNotice('')}>
          {notice}
        </Alert>
      </Snackbar>
    </>
  )

  const heading = (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, flexWrap: 'wrap' }}>
      <Typography variant="h4" component="h1" sx={{ fontSize: 22, fontWeight: 600, color: 'secondary.main', flex: 'none' }}>
        People
      </Typography>
      <Typography sx={{ fontSize: 13, color: 'text.secondary', display: stacked ? 'none' : 'block' }}>
        Make employees engineers so they can be assigned tickets, or move engineers back. {roleLabel('admin')}{' '}
        accounts can&apos;t be changed here.
      </Typography>
    </Box>
  )

  if (stacked) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {heading}
        <SearchField value={q} onChange={setQ} stacked />
        <RoleFilter value={role} counts={counts} onChange={setRole} stacked />
        <Box aria-busy={people.loading}>
          {people.loading && people.data && <LinearProgress sx={{ mb: 1 }} aria-label="Updating people" />}
          {body}
        </Box>
        {dialogs}
      </Box>
    )
  }

  return (
    <Box sx={{ height: FIT_HEIGHT, minHeight: 480, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {heading}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: { md: 'minmax(0,1fr) 300px', lg: 'minmax(0,1fr) 340px' },
          gap: 1.5,
        }}
      >
        <Box
          sx={{
            bgcolor: 'background.paper',
            border: '1px solid rgba(0,0,0,.12)',
            borderRadius: 2,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {people.loading && people.data && (
            <LinearProgress aria-label="Updating people" sx={{ position: 'absolute', top: 0, left: 0, right: 0 }} />
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, px: 2 }}>
            <RoleFilter value={role} counts={counts} onChange={setRole} stacked={false} />
            <SearchField value={q} onChange={setQ} stacked={false} />
          </Box>
          <Box aria-busy={people.loading} sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            {body}
          </Box>
          <Box
            sx={{
              flex: 'none',
              height: 36,
              display: 'flex',
              alignItems: 'center',
              px: 2,
              borderTop: '1px solid rgba(0,0,0,.12)',
              fontSize: 12,
              color: 'text.secondary',
            }}
          >
            {people.data ? footer : ''}
          </Box>
        </Box>

        {selected ? (
          <PersonPanel
            key={selected.user_id}
            user={selected}
            tickets={ticketsFor(selected, activeTickets)}
            ticketsError={Boolean(tickets.error)}
            onRetryTickets={tickets.reload}
            onRequestChange={requestChange}
          />
        ) : (
          <Box
            sx={{
              bgcolor: 'background.paper',
              border: '1px solid rgba(0,0,0,.12)',
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              p: 2,
              fontSize: 13,
              color: 'text.secondary',
              textAlign: 'center',
            }}
          >
            {people.data ? 'Pick someone to see their tickets and change their role.' : ''}
          </Box>
        )}
      </Box>
      {dialogs}
    </Box>
  )
}

export default PeoplePage
