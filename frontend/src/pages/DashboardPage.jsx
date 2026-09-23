import { useState } from 'react'
import PropTypes from 'prop-types'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import LinearProgress from '@mui/material/LinearProgress'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import { Link as RouterLink } from 'react-router'

import useAuth from '../auth/useAuth'
import ActiveTicketHighlight from '../components/dashboard/ActiveTicketHighlight'
import StatTiles from '../components/dashboard/StatTiles'
import TicketFilters from '../components/dashboard/TicketFilters'
import TicketList from '../components/dashboard/TicketList'
import ErrorState from '../components/ErrorState'
import useDebouncedValue from '../hooks/useDebouncedValue'
import useMyTickets from '../hooks/useMyTickets'
import { summarizeTickets } from '../utils/ticketStats'

const DEFAULT_FILTERS = { view: 'active', status: '', urgency: '', q: '' }

/** The dashboard's main action. */
function CreateTicketButton() {
  return (
    <Button component={RouterLink} to="/tickets/new" variant="contained" size="large" startIcon={<AddIcon />}>
      Create New Ticket
    </Button>
  )
}

function SummarySkeleton() {
  return (
    <Stack spacing={2} aria-label="Loading your tickets" aria-busy="true">
      <Skeleton variant="rounded" height={140} />
      <Skeleton variant="rounded" height={150} />
    </Stack>
  )
}

/** The filtered list: loading, error, no-match and results states. */
function TicketListSection({ list, filtersActive, onClearFilters }) {
  if (list.error) return <ErrorState message={list.error.message} onRetry={list.reload} />
  if (list.loading && list.tickets.length === 0) {
    return <Skeleton variant="rounded" height={160} aria-label="Loading tickets" />
  }
  if (list.tickets.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography gutterBottom>No tickets match these filters.</Typography>
          {filtersActive && (
            <Button onClick={onClearFilters} size="small">
              Clear filters
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }
  return (
    <Box aria-busy={list.loading}>
      {list.loading && <LinearProgress sx={{ mb: 1 }} aria-label="Updating tickets" />}
      <TicketList tickets={list.tickets} />
    </Box>
  )
}

TicketListSection.propTypes = {
  list: PropTypes.shape({
    tickets: PropTypes.array.isRequired,
    loading: PropTypes.bool.isRequired,
    error: PropTypes.instanceOf(Error),
    reload: PropTypes.func.isRequired,
  }).isRequired,
  filtersActive: PropTypes.bool.isRequired,
  onClearFilters: PropTypes.func.isRequired,
}

/**
 * Employee home: the most recent active ticket, headline counts, and a searchable,
 * filterable list of the employee's own tickets.
 */
function DashboardPage() {
  const { user } = useAuth()
  const summary = useMyTickets()
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const search = useDebouncedValue(filters.q.trim(), 300)
  const list = useMyTickets({
    view: filters.view === 'all' ? undefined : filters.view,
    status: filters.status || undefined,
    urgency: filters.urgency || undefined,
    q: search || undefined,
  })
  const firstName = user.full_name.split(' ')[0]
  const filtersActive =
    filters.status !== '' || filters.urgency !== '' || filters.q.trim() !== '' || filters.view !== 'active'

  let summaryContent
  if (summary.loading && summary.tickets.length === 0) {
    summaryContent = <SummarySkeleton />
  } else if (summary.error) {
    summaryContent = <ErrorState message={summary.error.message} onRetry={summary.reload} />
  } else if (summary.tickets.length === 0) {
    summaryContent = (
      <Card>
        <CardContent sx={{ textAlign: 'center', py: 6 }}>
          <Typography component="h2" variant="h5" gutterBottom>
            You haven&apos;t reported any issues yet
          </Typography>
          <Typography color="text.secondary">
            When something in the office needs fixing, create a ticket and track it here.
          </Typography>
        </CardContent>
      </Card>
    )
  } else {
    const stats = summarizeTickets(summary.tickets)
    summaryContent = (
      <>
        <ActiveTicketHighlight ticket={stats.mostRecentActive} />
        <StatTiles
          activeCount={stats.activeCount}
          byStatus={stats.byStatus}
          activeByUrgency={stats.activeByUrgency}
        />
        <Box component="section" aria-labelledby="my-tickets-title">
          <Typography id="my-tickets-title" component="h2" variant="h5" sx={{ mb: 2 }}>
            My tickets
          </Typography>
          <TicketFilters values={filters} onChange={setFilters} />
          <TicketListSection
            list={list}
            filtersActive={filtersActive}
            onClearFilters={() => setFilters(DEFAULT_FILTERS)}
          />
        </Box>
      </>
    )
  }

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' } }}
      >
        <Box>
          <Typography variant="h4" component="h1">
            My dashboard
          </Typography>
          <Typography color="text.secondary">Welcome back, {firstName}.</Typography>
        </Box>
        <CreateTicketButton />
      </Stack>
      {summaryContent}
    </Stack>
  )
}

export default DashboardPage
