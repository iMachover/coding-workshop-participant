import PropTypes from 'prop-types'
import Box from '@mui/material/Box'
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
import { formatDateTime, formatLocation, PRIORITIES } from '../../utils/ticketFormat'
import EscalatedChip from '../tickets/EscalatedChip'
import PriorityChip from '../tickets/PriorityChip'
import StatusLabel from '../tickets/StatusLabel'

const detailsPath = (ticket) => `/admin/tickets/${ticket.ticket_id}`
const engineerName = (ticket) => ticket.assigned_to_name ?? 'Unassigned'

/**
 * Every ticket for the Facility Admin, in the API's triage order: a table on larger
 * screens, stacked cards on phones. Each ticket links to its admin details page.
 */
function AdminTicketList({ tickets }) {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {tickets.map((t) => (
          <Card component="li" key={t.ticket_id}>
            <CardActionArea component={RouterLink} to={detailsPath(t)}>
              <CardContent>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1, mb: 1 }}>
                  <PriorityChip priority={t.priority} />
                  {t.escalation_requested && <EscalatedChip />}
                  <StatusLabel status={t.status} />
                </Stack>
                <Typography fontWeight={600}>
                  #{t.ticket_id} {t.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t.created_by_name} · {formatLocation(t)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Engineer: {engineerName(t)} · Opened {formatDateTime(t.created_at)}
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
      <Table size="small" aria-label="All tickets">
        <TableHead>
          <TableRow>
            <TableCell>Priority</TableCell>
            <TableCell>#</TableCell>
            <TableCell>Title</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Requester</TableCell>
            <TableCell>Engineer</TableCell>
            <TableCell>Location</TableCell>
            <TableCell>Opened</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {tickets.map((t) => (
            <TableRow key={t.ticket_id}>
              <TableCell>
                <PriorityChip priority={t.priority} />
              </TableCell>
              <TableCell>{t.ticket_id}</TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Link component={RouterLink} to={detailsPath(t)} sx={{ fontWeight: 600 }}>
                    {t.title}
                  </Link>
                  {t.escalation_requested && <EscalatedChip />}
                </Box>
              </TableCell>
              <TableCell>
                <StatusLabel status={t.status} />
              </TableCell>
              <TableCell>{t.created_by_name}</TableCell>
              <TableCell sx={{ color: t.assigned_to_name ? 'text.primary' : 'text.secondary' }}>
                {engineerName(t)}
              </TableCell>
              <TableCell>{formatLocation(t)}</TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(t.created_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

AdminTicketList.propTypes = {
  tickets: PropTypes.arrayOf(
    PropTypes.shape({
      ticket_id: PropTypes.number.isRequired,
      title: PropTypes.string.isRequired,
      status: PropTypes.string.isRequired,
      priority: PropTypes.oneOf(Object.keys(PRIORITIES)).isRequired,
      escalation_requested: PropTypes.bool.isRequired,
      building_name: PropTypes.string.isRequired,
      created_by_name: PropTypes.string.isRequired,
      assigned_to_name: PropTypes.string,
      created_at: PropTypes.string.isRequired,
    }),
  ).isRequired,
}

export default AdminTicketList
