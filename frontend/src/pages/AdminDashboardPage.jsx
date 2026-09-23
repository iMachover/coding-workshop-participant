import { useState } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import AdminTicketFilters from '../components/admin/AdminTicketFilters'
import AdminTicketList from '../components/admin/AdminTicketList'
import UnassignedQueue from '../components/admin/UnassignedQueue'
import TicketListSection from '../components/dashboard/TicketListSection'
import useAllTickets from '../hooks/useAllTickets'
import useApiData from '../hooks/useApiData'
import useDebouncedValue from '../hooks/useDebouncedValue'
import { listBuildings } from '../services/locationService'

const DEFAULT_FILTERS = {
  view: 'active',
  q: '',
  status: '',
  priority: '',
  category: '',
  building_id: '',
  assignment: '',
  escalated: false,
}

// Active tickets with no engineer, in the API's triage order (P1 first, then oldest).
const UNASSIGNED = { assignment: 'unassigned', view: 'active' }

/**
 * Turn the filter controls into API query params. Blank selects and an off switch are
 * left out; "all" means no view filter.
 * @param {typeof DEFAULT_FILTERS} filters
 * @param {string} search the debounced, trimmed search text
 */
function toQuery(filters, search) {
  return {
    view: filters.view === 'all' ? undefined : filters.view,
    q: search || undefined,
    status: filters.status || undefined,
    priority: filters.priority || undefined,
    category: filters.category || undefined,
    building_id: filters.building_id || undefined,
    assignment: filters.assignment || undefined,
    escalated: filters.escalated || undefined,
  }
}

/**
 * Facility Admin home: the unassigned tickets that need an engineer, always on top,
 * then every ticket with search and filters. Priority shows everywhere here.
 */
function AdminDashboardPage() {
  const queue = useAllTickets(UNASSIGNED)
  const buildings = useApiData(listBuildings)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const search = useDebouncedValue(filters.q.trim(), 300)
  const list = useAllTickets(toQuery(filters, search))
  const filtersActive = Object.keys(DEFAULT_FILTERS).some((key) =>
    key === 'q' ? filters.q.trim() !== '' : filters[key] !== DEFAULT_FILTERS[key],
  )

  return (
    <Stack spacing={4}>
      <Box>
        <Typography variant="h4" component="h1">
          Facility Admin dashboard
        </Typography>
        <Typography color="text.secondary">Triage new tickets and keep an eye on everything open.</Typography>
      </Box>

      <UnassignedQueue queue={queue} />

      <Box component="section" aria-labelledby="all-tickets-title">
        <Typography id="all-tickets-title" component="h2" variant="h5" sx={{ mb: 2 }}>
          All tickets
        </Typography>
        <AdminTicketFilters values={filters} onChange={setFilters} buildings={buildings.data ?? []} />
        <TicketListSection list={list} filtersActive={filtersActive} onClearFilters={() => setFilters(DEFAULT_FILTERS)}>
          <AdminTicketList tickets={list.tickets} />
        </TicketListSection>
      </Box>
    </Stack>
  )
}

export default AdminDashboardPage
