import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Divider from '@mui/material/Divider'
import Grid from '@mui/material/Grid'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink, useParams } from 'react-router'

import FinishTicket from '../components/admin/FinishTicket'
import TicketAssignment from '../components/admin/TicketAssignment'
import BackLink from '../components/BackLink'
import ErrorState from '../components/ErrorState'
import Panel from '../components/Panel'
import NoteList from '../components/tickets/NoteList'
import RequesterContact from '../components/tickets/RequesterContact'
import StaffTicketSummary from '../components/tickets/StaffTicketSummary'
import StatusHistory from '../components/tickets/StatusHistory'
import TicketFacts from '../components/tickets/TicketFacts'
import TicketWorkflow from '../components/tickets/TicketWorkflow'
import useApiData from '../hooks/useApiData'
import { getTicket, listTicketHistory, listTicketNotes } from '../services/adminTicketService'
import { listEngineers } from '../services/adminUserService'

function BackToAdminDashboard() {
  return <BackLink to="/admin">Back to admin dashboard</BackLink>
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

/**
 * Any ticket, as a Facility Admin sees it: priority, where it is in the workflow and how
 * it got there (and closing or sending back a resolved ticket), its details, who owns it
 * (and assigning it), who reported it and how to reach them, and every note.
 */
function AdminTicketDetailsPage() {
  const { ticketId } = useParams()
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
      <Stack spacing={2} aria-label="Loading ticket" aria-busy="true">
        <Skeleton variant="text" width={240} />
        <Skeleton variant="rounded" height={140} />
        <Skeleton variant="rounded" height={220} />
      </Stack>
    )
  }

  const t = ticket.data
  // The new engineer and dates show in the facts, and the engineers' loads have changed.
  const refreshAfterAssign = () => {
    ticket.reload()
    engineers.reload()
  }
  // Closing or sending back moves the workflow and the history, and the engineer's load.
  const refreshAfterFinish = () => {
    ticket.reload()
    history.reload()
    engineers.reload()
  }

  return (
    <Stack spacing={3}>
      <BackToAdminDashboard />
      <StaffTicketSummary ticket={t} />

      <Panel title="Progress">
        <TicketWorkflow status={t.status} blockedReason={t.blocked_reason} />
        <Divider sx={{ my: 3 }} />
        <Box component="section" aria-label="Finish ticket">
          <FinishTicket ticketId={t.ticket_id} status={t.status} onFinished={refreshAfterFinish} />
        </Box>
      </Panel>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Panel title="Details">
            <Typography sx={{ whiteSpace: 'pre-wrap', mb: 3 }}>{t.description}</Typography>
            <TicketFacts ticket={t} />
          </Panel>
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <Stack spacing={3}>
            <Panel title="Assignment">
              <TicketAssignment ticket={t} engineers={engineers} onAssigned={refreshAfterAssign} />
            </Panel>
            <Panel title="Requester">
              <RequesterContact name={t.created_by_name} email={t.created_by_email} phone={t.created_by_phone} />
            </Panel>
          </Stack>
        </Grid>
      </Grid>

      <Panel title="Status history">
        <StatusHistory history={history} />
      </Panel>

      <Panel title="Notes">
        <NoteList notes={notes} />
      </Panel>
    </Stack>
  )
}

export default AdminTicketDetailsPage
