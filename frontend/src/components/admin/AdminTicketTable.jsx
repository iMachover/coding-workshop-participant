import { useState } from 'react'
import PropTypes from 'prop-types'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TablePagination from '@mui/material/TablePagination'
import TableRow from '@mui/material/TableRow'
import PriorityHighIcon from '@mui/icons-material/PriorityHigh'
import { Link as RouterLink, useNavigate } from 'react-router'

import useIsMobile from '../../hooks/useIsMobile'
import { brand } from '../../theme'
import { CATEGORIES, formatAge, formatLocation, PRIORITIES } from '../../utils/ticketFormat'
import { PriorityPill, StatusPill } from './TicketPills'

const UNASSIGNED_RED = '#B3261E'
const ROWS_PER_PAGE = [10, 25, 50]

const ticketPath = (ticket) => `/admin/tickets/${ticket.ticket_id}`

/** Red "!" after the title of a ticket the requester escalated. */
function EscalatedMark() {
  return <PriorityHighIcon titleAccess="Escalated" sx={{ fontSize: 16, color: UNASSIGNED_RED, flex: 'none' }} />
}

/** "Sam Tech", or a red "Unassigned". */
function EngineerName({ ticket }) {
  const name = ticket.assigned_to_name
  return (
    <Box component="span" sx={{ color: name ? 'text.primary' : UNASSIGNED_RED }}>
      {name ?? 'Unassigned'}
    </Box>
  )
}

EngineerName.propTypes = {
  ticket: PropTypes.shape({ assigned_to_name: PropTypes.string }).isRequired,
}

const ellipsis = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }

// Column widths from the mockup, widened where our labels are longer.
const COLUMNS = [
  ['#', 72],
  ['Title · location', undefined],
  ['Category', 150],
  ['Priority', 72],
  ['Status', 112],
  ['Engineer', 140],
  ['Age', 64],
]

/** The desktop table. Its body scrolls inside the panel under a sticky header. */
function TicketTable({ tickets }) {
  const navigate = useNavigate()
  // The # link handles the keyboard; a click anywhere else on the row opens the ticket too.
  const openRow = (ticket) => (event) => {
    if (!event.target.closest('a')) navigate(ticketPath(ticket))
  }

  return (
    <TableContainer sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      <Table size="small" stickyHeader aria-label="All tickets" sx={{ tableLayout: 'fixed', minWidth: 760 }}>
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
              sx={{ cursor: 'pointer', '&.MuiTableRow-hover:hover': { bgcolor: '#F0F7FC' }, '& td': { fontSize: 13, py: 0.5 } }}
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
              <TableCell sx={{ ...ellipsis, color: 'text.secondary' }}>{CATEGORIES[t.category]}</TableCell>
              <TableCell>
                <PriorityPill priority={t.priority} />
              </TableCell>
              <TableCell>
                <StatusPill status={t.status} />
              </TableCell>
              <TableCell sx={ellipsis}>
                <EngineerName ticket={t} />
              </TableCell>
              <TableCell align="right" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                {formatAge(t.created_at)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

/** The phone version: one card per ticket. */
function TicketCards({ tickets }) {
  return (
    <Stack component="ul" spacing={1} sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {tickets.map((t) => (
        <Card component="li" key={t.ticket_id}>
          <CardActionArea component={RouterLink} to={ticketPath(t)} sx={{ px: 1.5, py: 1.25 }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', fontSize: 12, mb: 0.5 }}>
              <Box component="span" sx={{ fontWeight: 600, color: 'primary.main' }}>
                #{t.ticket_id}
              </Box>
              <PriorityPill priority={t.priority} />
              <StatusPill status={t.status} />
              {t.escalation_requested && <EscalatedMark />}
              <Box component="span" sx={{ ml: 'auto !important', color: 'text.secondary' }}>
                {formatAge(t.created_at)}
              </Box>
            </Stack>
            <Box sx={{ fontSize: 14, fontWeight: 500 }}>{t.title}</Box>
            <Box sx={{ fontSize: 12, color: 'text.secondary' }}>
              {formatLocation(t)} · <EngineerName ticket={t} />
            </Box>
          </CardActionArea>
        </Card>
      ))}
    </Stack>
  )
}

const ticketsShape = PropTypes.arrayOf(
  PropTypes.shape({
    ticket_id: PropTypes.number.isRequired,
    title: PropTypes.string.isRequired,
    category: PropTypes.oneOf(Object.keys(CATEGORIES)).isRequired,
    status: PropTypes.string.isRequired,
    priority: PropTypes.oneOf(Object.keys(PRIORITIES)).isRequired,
    escalation_requested: PropTypes.bool.isRequired,
    building_name: PropTypes.string.isRequired,
    assigned_to_name: PropTypes.string,
    created_at: PropTypes.string.isRequired,
  }),
)

TicketTable.propTypes = { tickets: ticketsShape.isRequired }
TicketCards.propTypes = { tickets: ticketsShape.isRequired }

/**
 * Every ticket in the current filters, in the API's triage order, a page at a time
 * (paged here, since the API returns them all): a dense table on larger screens, cards on
 * phones. The parent remounts it (via `key`) when the filters change, so it starts again
 * on page one. Admin dashboard only: it shows priority.
 */
function AdminTicketTable({ tickets }) {
  const isMobile = useIsMobile()
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(25)
  // After a reload the list can get shorter; stay on the last page that still exists.
  const lastPage = Math.max(0, Math.ceil(tickets.length / rowsPerPage) - 1)
  const current = Math.min(page, lastPage)
  const shown = tickets.slice(current * rowsPerPage, (current + 1) * rowsPerPage)

  return (
    <>
      {isMobile ? <TicketCards tickets={shown} /> : <TicketTable tickets={shown} />}
      <TablePagination
        component="div"
        count={tickets.length}
        page={current}
        rowsPerPage={rowsPerPage}
        rowsPerPageOptions={ROWS_PER_PAGE}
        onPageChange={(_event, next) => setPage(next)}
        onRowsPerPageChange={(event) => {
          setRowsPerPage(Number(event.target.value))
          setPage(0)
        }}
        sx={{
          flex: 'none',
          borderTop: isMobile ? 0 : 1,
          borderColor: 'divider',
          '& .MuiTablePagination-toolbar': { minHeight: 40 },
          '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': { fontSize: 12 },
        }}
      />
    </>
  )
}

AdminTicketTable.propTypes = { tickets: ticketsShape.isRequired }

export default AdminTicketTable
