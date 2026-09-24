import { useState } from 'react'
import PropTypes from 'prop-types'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Snackbar from '@mui/material/Snackbar'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { useSearchParams } from 'react-router'

import AllTicketsPanel from '../components/admin/AllTicketsPanel'
import EngineerWorkload from '../components/admin/EngineerWorkload'
import MetricCards from '../components/admin/MetricCards'
import UnassignedQueue from '../components/admin/UnassignedQueue'
import useAllTickets from '../hooks/useAllTickets'
import useApiData from '../hooks/useApiData'
import useDebouncedValue from '../hooks/useDebouncedValue'
import useIsMobile from '../hooks/useIsMobile'
import { getMetrics } from '../services/adminTicketService'
import { getFacilities } from '../services/adminFacilityService'
import { listEngineers } from '../services/adminUserService'
import { METRIC_CARDS, selectedMetric } from '../utils/adminMetrics'

const DEFAULT_FILTERS = {
  view: 'active',
  q: '',
  status: '',
  priority: '',
  category: '',
  building_id: '',
  assignment: '',
  assigned_to: '',
  escalated: false,
}

// Active tickets with no engineer, in the API's triage order (P1 first, then oldest).
const UNASSIGNED = { assignment: 'unassigned', view: 'active' }

/** A database id from the URL, or '' if it isn't one. */
const idParam = (value) => (/^[1-9]\d{0,9}$/.test(value ?? '') ? value : '')

/** A phone tab's label, with a count bubble (e.g. unassigned tickets) when given one. */
function TabLabel({ label, count = null, selected }) {
  return (
    <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      {label}
      {count !== null && (
        <Box
          component="span"
          sx={{
            minWidth: 18,
            height: 18,
            px: 0.625,
            borderRadius: 9,
            boxSizing: 'border-box',
            bgcolor: selected ? 'primary.main' : 'rgba(0,0,0,.45)',
            color: 'common.white',
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {count}
        </Box>
      )}
    </Box>
  )
}

TabLabel.propTypes = {
  label: PropTypes.string.isRequired,
  count: PropTypes.number,
  selected: PropTypes.bool.isRequired,
}

const PHONE_TABS = [
  ['queue', 'Queue'],
  ['tickets', 'Tickets'],
  ['engineers', 'Engineers'],
]

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
    assigned_to: filters.assigned_to || undefined,
    escalated: filters.escalated || undefined,
  }
}

/**
 * Facility Admin home, built to fit one screen on large displays: headline counts (each a
 * shortcut to its tickets), then All tickets (search, filters, a paged table) beside the
 * unassigned tickets that need an engineer (assignable in one click) and each engineer's
 * workload. The panels scroll inside themselves instead of the page. Tablets stack the
 * queue and workload above All tickets and scroll the page. Phones show the counts, then
 * one section at a time in Queue / Tickets / Engineers tabs; choosing a count or an
 * engineer jumps to Tickets.
 * Priority shows everywhere here. `?engineer=<id>` opens it filtered to that engineer
 * (the People page links here that way), and `?building=<id>` to that building (from
 * the Facilities page). The Building filter lists inactive buildings too, since their
 * tickets are still here.
 */
function AdminDashboardPage() {
  const isMobile = useIsMobile()
  const [searchParams] = useSearchParams()
  const metrics = useApiData(getMetrics)
  const queue = useAllTickets(UNASSIGNED)
  const engineers = useApiData(listEngineers)
  const facilities = useApiData(getFacilities)
  const [filters, setFilters] = useState(() => ({
    ...DEFAULT_FILTERS,
    assigned_to: idParam(searchParams.get('engineer')),
    building_id: idParam(searchParams.get('building')),
  }))
  const [notice, setNotice] = useState('')
  const [phoneTab, setPhoneTab] = useState('queue')
  const search = useDebouncedValue(filters.q.trim(), 300)
  const query = toQuery(filters, search)
  const list = useAllTickets(query)
  const filtersActive = Object.keys(DEFAULT_FILTERS).some((key) =>
    key === 'q' ? filters.q.trim() !== '' : filters[key] !== DEFAULT_FILTERS[key],
  )
  const metricKey = selectedMetric(filters, DEFAULT_FILTERS)

  // An assignment changes the queue, the engineer's load and the list's Engineer column.
  const handleAssigned = (ticket) => {
    setNotice(`#${ticket.ticket_id} assigned to ${ticket.assigned_to_name}.`)
    queue.reload()
    engineers.reload()
    list.reload()
    metrics.reload()
  }

  // A metric card shows its tickets in All tickets; choosing it again goes back to the
  // defaults. "Active" is the default view, so it always goes back to the defaults.
  const handleSelectMetric = (key) => {
    const card = METRIC_CARDS.find((c) => c.key === key)
    const toDefaults = !card.filters || metricKey === key
    setFilters(toDefaults ? DEFAULT_FILTERS : { ...DEFAULT_FILTERS, ...card.filters })
    if (isMobile) setPhoneTab('tickets')
    else document.getElementById('all-tickets-title')?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
  }

  // Choosing an engineer shows only their tickets; choosing them again clears that.
  const handleSelectEngineer = (userId) => {
    const id = String(userId)
    setFilters({ ...filters, assignment: '', assigned_to: filters.assigned_to === id ? '' : id })
    if (isMobile) setPhoneTab('tickets')
  }

  const snackbar = (
    <Snackbar
      open={Boolean(notice)}
      autoHideDuration={5000}
      onClose={() => setNotice('')}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert severity="success" variant="filled" onClose={() => setNotice('')}>
        {notice}
      </Alert>
    </Snackbar>
  )
  const metricCards = <MetricCards metrics={metrics} selected={metricKey} onSelect={handleSelectMetric} />
  // On large screens the queue takes at most ~half the side column; the workload gets the rest.
  const queuePanel = (
    <UnassignedQueue
      queue={queue}
      engineers={engineers}
      onAssigned={handleAssigned}
      sx={{ flex: { lg: '0 1 auto' }, maxHeight: { lg: '58%' } }}
    />
  )
  const workloadPanel = (
    <EngineerWorkload
      engineers={engineers}
      selectedId={filters.assigned_to ? Number(filters.assigned_to) : null}
      onSelect={handleSelectEngineer}
      sx={{ flex: { lg: 1 } }}
    />
  )
  const ticketsPanel = (
    <AllTicketsPanel
      list={list}
      filters={filters}
      onChangeFilters={setFilters}
      resetKey={JSON.stringify(query)}
      metricLabel={metricKey && METRIC_CARDS.find((c) => c.key === metricKey).label}
      onClearMetric={() => setFilters(DEFAULT_FILTERS)}
      filtersActive={filtersActive}
      onClearFilters={() => setFilters(DEFAULT_FILTERS)}
      buildings={facilities.data ?? []}
      engineers={engineers.data ?? []}
    />
  )

  if (isMobile) {
    const queueCount = queue.error || (queue.loading && queue.tickets.length === 0) ? null : queue.tickets.length
    const panels = { queue: queuePanel, tickets: ticketsPanel, engineers: workloadPanel }
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Typography variant="h4" component="h1" sx={{ fontSize: 20 }}>
          Facility Admin dashboard
        </Typography>
        {metricCards}
        {/* Edge to edge, like the mockup: undo the page's 16px side padding. */}
        <Box sx={{ mx: -2, bgcolor: 'background.paper', borderTop: 1, borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={phoneTab} onChange={(_event, tab) => setPhoneTab(tab)} variant="fullWidth" aria-label="Dashboard sections">
            {PHONE_TABS.map(([key, label]) => (
              <Tab
                key={key}
                value={key}
                id={`admin-tab-${key}`}
                aria-controls={`admin-tabpanel-${key}`}
                label={<TabLabel label={label} count={key === 'queue' ? queueCount : null} selected={phoneTab === key} />}
                sx={{ minHeight: 48, fontSize: 14 }}
              />
            ))}
          </Tabs>
        </Box>
        <Box role="tabpanel" id={`admin-tabpanel-${phoneTab}`} aria-labelledby={`admin-tab-${phoneTab}`}>
          {panels[phoneTab]}
        </Box>
        {snackbar}
      </Box>
    )
  }

  return (
    <Box sx={{ height: { lg: '100%' }, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 1.5, flex: 'none' }}>
        <Typography variant="h4" component="h1" sx={{ fontSize: 22, whiteSpace: 'nowrap' }}>
          Facility Admin dashboard
        </Typography>
        <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
          Triage new tickets and keep an eye on everything open.
        </Typography>
      </Box>

      <Box sx={{ flex: 'none' }}>{metricCards}</Box>

      <Box
        sx={{
          flex: { lg: 1 },
          minHeight: { lg: 0 },
          display: 'grid',
          gap: 1.5,
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 380px' },
          gridTemplateAreas: { xs: '"side" "main"', lg: '"main side"' },
        }}
      >
        <Box sx={{ gridArea: 'main', display: 'flex', flexDirection: 'column', minHeight: 0 }}>{ticketsPanel}</Box>

        <Box
          sx={{
            gridArea: 'side',
            minHeight: 0,
            display: { xs: 'flex', md: 'grid', lg: 'flex' },
            flexDirection: 'column',
            gridTemplateColumns: { md: 'repeat(2, minmax(0, 1fr))' },
            alignItems: { md: 'start', lg: 'stretch' },
            gap: 1.5,
          }}
        >
          {queuePanel}
          {workloadPanel}
        </Box>
      </Box>

      {snackbar}
    </Box>
  )
}

export default AdminDashboardPage
