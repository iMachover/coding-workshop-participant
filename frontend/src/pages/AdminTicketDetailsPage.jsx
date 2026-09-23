import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Grid from '@mui/material/Grid'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink, useParams } from 'react-router'

import RequesterContact from '../components/admin/RequesterContact'
import BackLink from '../components/BackLink'
import ErrorState from '../components/ErrorState'
import Panel from '../components/Panel'
import EscalatedChip from '../components/tickets/EscalatedChip'
import NoteList from '../components/tickets/NoteList'
import PriorityChip from '../components/tickets/PriorityChip'
import StatusHistory from '../components/tickets/StatusHistory'
import StatusLabel from '../components/tickets/StatusLabel'
import TicketFacts from '../components/tickets/TicketFacts'
import TicketWorkflow from '../components/tickets/TicketWorkflow'
import UrgencyLabel from '../components/tickets/UrgencyLabel'
import useApiData from '../hooks/useApiData'
import { getTicket, listTicketHistory, listTicketNotes } from '../services/adminTicketService'
import { SCOPES } from '../utils/ticketFormat'

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
 * it got there, its details, who reported it and how to reach them, and every note.
 * Read-only for now; assigning and closing come in later slices.
 */
function AdminTicketDetailsPage() {
  const { ticketId } = useParams()
  const validId = /^[1-9]\d{0,9}$/.test(ticketId)
  const ticket = useApiData(getTicket, { ticketId }, { skip: !validId })
  const history = useApiData(listTicketHistory, { ticketId }, { skip: !validId })
  const notes = useApiData(listTicketNotes, { ticketId }, { skip: !validId })

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
  return (
    <Stack spacing={3}>
      <BackToAdminDashboard />

      <Box>
        <Typography variant="h4" component="h1">
          #{t.ticket_id} {t.title}
        </Typography>
        {/* gap, not spacing: spacing's margins would indent items that wrap on phones. */}
        <Stack direction="row" sx={{ mt: 1, flexWrap: 'wrap', alignItems: 'center', columnGap: 3, rowGap: 1 }}>
          <PriorityChip priority={t.priority} />
          <StatusLabel status={t.status} />
          <Typography component="span" color="text.secondary">
            Urgency: <UrgencyLabel urgency={t.urgency} />
          </Typography>
          <Typography component="span" color="text.secondary">
            Impact: {SCOPES[t.affected_scope]}
          </Typography>
          {t.escalation_requested && <EscalatedChip />}
        </Stack>
        <Typography sx={{ mt: 1 }}>{t.short_description}</Typography>
      </Box>

      {t.escalation_requested && (
        <Alert severity="warning">
          <AlertTitle>{t.created_by_name} asked for an admin to review this ticket</AlertTitle>
          <Typography sx={{ whiteSpace: 'pre-wrap' }}>{t.escalation_reason}</Typography>
        </Alert>
      )}

      <Panel title="Progress">
        <TicketWorkflow status={t.status} blockedReason={t.blocked_reason} />
      </Panel>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Panel title="Details">
            <Typography sx={{ whiteSpace: 'pre-wrap', mb: 3 }}>{t.description}</Typography>
            <TicketFacts ticket={t} />
          </Panel>
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <Panel title="Requester">
            <RequesterContact name={t.created_by_name} email={t.created_by_email} phone={t.created_by_phone} />
          </Panel>
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
