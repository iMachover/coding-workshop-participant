import { useState } from 'react'
import Box from '@mui/material/Box'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import useAuth from '../auth/useAuth'
import TicketListSection from '../components/dashboard/TicketListSection'
import CurrentTicketCard from '../components/engineer/CurrentTicketCard'
import EngineerQueueFilters from '../components/engineer/EngineerQueueFilters'
import QueueTiles from '../components/engineer/QueueTiles'
import ErrorState from '../components/ErrorState'
import StaffTicketList from '../components/tickets/StaffTicketList'
import useApiData from '../hooks/useApiData'
import useDebouncedValue from '../hooks/useDebouncedValue'
import { changeTicketStatus, listMyQueue } from '../services/engineerTicketService'
import { listBuildings } from '../services/locationService'
import { countQueue, pickCurrentTicket } from '../utils/engineerQueue'

const DEFAULT_FILTERS = { view: 'active', q: '', status: '', priority: '', building_id: '' }
const ACTIVE = { view: 'active' }

const engineerTicketPath = (ticket) => `/engineer/tickets/${ticket.ticket_id}`

/**
 * Engineer home ("My queue"): the ticket they're on (or the next one to pick up),
 * counts of their active work, then every ticket assigned to them with search and
 * filters, in triage order.
 */
function EngineerDashboardPage() {
  const { user } = useAuth()
  const summary = useApiData(listMyQueue, ACTIVE)
  const buildings = useApiData(listBuildings)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const search = useDebouncedValue(filters.q.trim(), 300)
  const list = useApiData(listMyQueue, {
    view: filters.view === 'all' ? undefined : filters.view,
    q: search || undefined,
    status: filters.status || undefined,
    priority: filters.priority || undefined,
    building_id: filters.building_id || undefined,
  })
  const filtersActive = Object.keys(DEFAULT_FILTERS).some((key) =>
    key === 'q' ? filters.q.trim() !== '' : filters[key] !== DEFAULT_FILTERS[key],
  )

  // Starting the "Up next" ticket makes it the current one and changes the counts and list.
  const startWork = async (ticket) => {
    await changeTicketStatus(ticket.ticket_id, 'in_progress')
    summary.reload()
    list.reload()
  }

  let summaryContent
  if (summary.error) {
    summaryContent = <ErrorState message={summary.error.message} onRetry={summary.reload} />
  } else if (!summary.data) {
    summaryContent = (
      <Stack spacing={2} aria-label="Loading your queue" aria-busy="true">
        <Skeleton variant="rounded" height={160} />
        <Skeleton variant="rounded" height={90} />
      </Stack>
    )
  } else {
    summaryContent = (
      <>
        <CurrentTicketCard pick={pickCurrentTicket(summary.data)} onStart={startWork} />
        <QueueTiles counts={countQueue(summary.data)} />
      </>
    )
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" component="h1">
          My queue
        </Typography>
        <Typography color="text.secondary">
          Welcome back, {user.full_name.split(' ')[0]}. These are the tickets assigned to you.
        </Typography>
      </Box>

      {summaryContent}

      <Box component="section" aria-labelledby="my-queue-title">
        <Typography id="my-queue-title" component="h2" variant="h5" sx={{ mb: 2 }}>
          My tickets
        </Typography>
        <EngineerQueueFilters values={filters} onChange={setFilters} buildings={buildings.data ?? []} />
        <TicketListSection
          list={{ tickets: list.data ?? [], loading: list.loading, error: list.error, reload: list.reload }}
          filtersActive={filtersActive}
          onClearFilters={() => setFilters(DEFAULT_FILTERS)}
        >
          <StaffTicketList
            tickets={list.data ?? []}
            label="My tickets"
            detailsPath={engineerTicketPath}
            showEngineer={false}
          />
        </TicketListSection>
      </Box>
    </Stack>
  )
}

export default EngineerDashboardPage
