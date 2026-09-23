import PropTypes from 'prop-types'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Link from '@mui/material/Link'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'

import useIsMobile from '../../hooks/useIsMobile'
import { roleLabel } from '../../utils/roles'

// The only roles an admin can give from the app; admin accounts are set up outside it.
const ASSIGNABLE_ROLES = ['employee', 'engineer']

/**
 * The person's role: a dropdown for employees and engineers, plain text for admins.
 * Picking a different role asks the page to confirm; the value only changes once saved.
 */
function RoleControl({ user, onRequestChange }) {
  if (!ASSIGNABLE_ROLES.includes(user.role)) {
    return <Typography component="span">{roleLabel(user.role)}</Typography>
  }
  return (
    <TextField
      select
      label="Role"
      size="small"
      value={user.role}
      // MUI only fires onChange for a different value, so this is always a real change.
      onChange={(event) => onRequestChange(user, event.target.value)}
      sx={{ minWidth: 150 }}
    >
      {ASSIGNABLE_ROLES.map((role) => (
        <MenuItem key={role} value={role}>
          {roleLabel(role)}
        </MenuItem>
      ))}
    </TextField>
  )
}

/** Active tickets; an engineer's count links to their tickets on the dashboard. */
function ActiveTickets({ user }) {
  const text = `${user.active_ticket_count} active`
  if (user.role !== 'engineer' || user.active_ticket_count === 0) {
    return <Typography component="span" color="text.secondary">{text}</Typography>
  }
  return (
    <Link component={RouterLink} to={`/admin?engineer=${user.user_id}`} aria-label={`${user.full_name}: ${text} tickets`}>
      {text}
    </Link>
  )
}

const userShape = PropTypes.shape({
  user_id: PropTypes.number.isRequired,
  full_name: PropTypes.string.isRequired,
  email: PropTypes.string.isRequired,
  role: PropTypes.string.isRequired,
  active_ticket_count: PropTypes.number.isRequired,
})

RoleControl.propTypes = { user: userShape.isRequired, onRequestChange: PropTypes.func.isRequired }
ActiveTickets.propTypes = { user: userShape.isRequired }

/**
 * Everyone, as the API sorts them (by name): a table on larger screens, stacked cards
 * on phones. `onRequestChange(user, role)` is called when a new role is picked.
 */
function PeopleList({ users, onRequestChange }) {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {users.map((u) => (
          <Card component="li" key={u.user_id}>
            <CardContent>
              <Typography fontWeight={600}>{u.full_name}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere', mb: 1.5 }}>
                {u.email}
              </Typography>
              <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                <RoleControl user={u} onRequestChange={onRequestChange} />
                <ActiveTickets user={u} />
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>
    )
  }

  return (
    <TableContainer component={Card}>
      <Table size="small" aria-label="People">
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Email</TableCell>
            <TableCell>Role</TableCell>
            <TableCell>Tickets</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.user_id}>
              <TableCell sx={{ fontWeight: 600 }}>{u.full_name}</TableCell>
              <TableCell>{u.email}</TableCell>
              <TableCell sx={{ py: 1 }}>
                <RoleControl user={u} onRequestChange={onRequestChange} />
              </TableCell>
              <TableCell>
                <ActiveTickets user={u} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

PeopleList.propTypes = {
  users: PropTypes.arrayOf(userShape).isRequired,
  onRequestChange: PropTypes.func.isRequired,
}

export default PeopleList
