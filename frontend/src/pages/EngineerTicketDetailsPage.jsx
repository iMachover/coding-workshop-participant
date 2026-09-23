import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Grid from '@mui/material/Grid'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink, useParams } from 'react-router'

import BackLink from '../components/BackLink'
import ErrorState from '../components/ErrorState'
import Panel from '../components/Panel'
import RequesterContact from '../components/tickets/RequesterContact'
import StaffTicketSummary from '../components/tickets/StaffTicketSummary'
import StatusHistory from '../components/tickets/StatusHistory'
import TicketFacts from '../components/tickets/TicketFacts'
import TicketNotes from '../components/tickets/TicketNotes'
import TicketWorkflow from '../components/tickets/TicketWorkflow'
import useApiData from '../hooks/useApiData'
import {
  addAssignedTicketNote,
  getAssignedTicket,
  listAssignedTicketHistory,
  listAssignedTicketNotes,
} from '../services/engineerTicketService'

function BackToQueue() {
  return <BackLink to="/engineer">Back to my queue</BackLink>
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

/**
 * One of the engineer's tickets: priority, where it is in the workflow and how it got
 * there, its details, how to reach the requester, and the notes conversation (they can
 * add to it until the ticket is closed). Status controls come in E2.
 */
function EngineerTicketDetailsPage() {
  const { ticketId } = useParams()
  const validId = /^[1-9]\d{0,9}$/.test(ticketId)
  const ticket = useApiData(getAssignedTicket, { ticketId }, { skip: !validId })
  const history = useApiData(listAssignedTicketHistory, { ticketId }, { skip: !validId })
  const notes = useApiData(listAssignedTicketNotes, { ticketId }, { skip: !validId })

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
      <Stack spacing={2} aria-label="Loading ticket" aria-busy="true">
        <Skeleton variant="text" width={240} />
        <Skeleton variant="rounded" height={140} />
        <Skeleton variant="rounded" height={220} />
      </Stack>
    )
  }

  const t = ticket.data
  // A new note moves the ticket's updated_at, which the facts show.
  const refresh = () => {
    ticket.reload()
    notes.reload()
  }

  return (
    <Stack spacing={3}>
      <BackToQueue />
      <StaffTicketSummary ticket={t} />

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
        <TicketNotes
          ticketId={t.ticket_id}
          closed={t.status === 'closed'}
          notes={notes}
          addNote={addAssignedTicketNote}
          placeholder="Tell the requester what you've found or what happens next."
          onAdded={refresh}
        />
      </Panel>
    </Stack>
  )
}

export default EngineerTicketDetailsPage
