import PropTypes from 'prop-types'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'

import useIsMobile from '../../hooks/useIsMobile'
import { formatDateTime, formatLocation, SCOPES } from '../../utils/ticketFormat'
import StatusLabel from '../tickets/StatusLabel'
import UrgencyLabel from '../tickets/UrgencyLabel'

/**
 * The employee's tickets: a table on larger screens, stacked cards on phones.
 * Each ticket links to its details page.
 */
function TicketList({ tickets }) {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {tickets.map((t) => (
          <Card component="li" key={t.ticket_id}>
            <CardActionArea component={RouterLink} to={`/tickets/${t.ticket_id}`}>
            <CardContent>
              <Typography fontWeight={600}>
                #{t.ticket_id} {t.title}
              </Typography>
              <Stack direction="row" spacing={2} sx={{ my: 1 }}>
                <StatusLabel status={t.status} />
                <UrgencyLabel urgency={t.urgency} />
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {SCOPES[t.affected_scope]} · {formatLocation(t)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Updated {formatDateTime(t.updated_at)}
              </Typography>
            </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Stack>
    )
  }

  return (
    <TableContainer component={Card}>
      <Table size="small" aria-label="My tickets">
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Title</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Urgency</TableCell>
            <TableCell>Impact</TableCell>
            <TableCell>Location</TableCell>
            <TableCell>Updated</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {tickets.map((t) => (
            <TableRow key={t.ticket_id}>
              <TableCell>{t.ticket_id}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>
                <Link component={RouterLink} to={`/tickets/${t.ticket_id}`}>
                  {t.title}
                </Link>
              </TableCell>
              <TableCell>
                <StatusLabel status={t.status} />
              </TableCell>
              <TableCell>
                <UrgencyLabel urgency={t.urgency} />
              </TableCell>
              <TableCell>{SCOPES[t.affected_scope]}</TableCell>
              <TableCell>{formatLocation(t)}</TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(t.updated_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

TicketList.propTypes = {
  tickets: PropTypes.arrayOf(
    PropTypes.shape({
      ticket_id: PropTypes.number.isRequired,
      title: PropTypes.string.isRequired,
      status: PropTypes.string.isRequired,
      urgency: PropTypes.string.isRequired,
      affected_scope: PropTypes.string.isRequired,
      building_name: PropTypes.string.isRequired,
      updated_at: PropTypes.string.isRequired,
    }),
  ).isRequired,
}

export default TicketList
