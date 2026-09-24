import { useState } from 'react'
import PropTypes from 'prop-types'
import Badge from '@mui/material/Badge'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import TuneIcon from '@mui/icons-material/Tune'

import useIsMobile from '../../hooks/useIsMobile'
import ErrorState from '../ErrorState'
import AdminTicketFilters, { SearchField, ViewToggle } from './AdminTicketFilters'
import AdminTicketTable from './AdminTicketTable'
import { panelHeadingSx, panelSx, visuallyHiddenSx } from './panelStyles'

const VIEW_LABELS = { active: 'Active tickets', closed: 'Closed tickets', all: 'All tickets' }

// The filters that fold away behind the phone's filters button.
const HIDDEN_FILTERS = ['status', 'priority', 'category', 'building_id', 'assignment', 'assigned_to', 'escalated']

/**
 * The dashboard's main panel: "All tickets" with the active/closed/all switch, the
 * chosen metric card as a removable chip, the filters, then the table. On large screens
 * it fills its space and the table scrolls inside it. On phones (a tab of its own) there's
 * no frame: search plus a button that shows or hides the other filters, then ticket cards.
 */
function AllTicketsPanel({
  list,
  filters,
  onChangeFilters,
  resetKey,
  metricLabel = null,
  onClearMetric,
  filtersActive,
  onClearFilters,
  buildings,
  engineers,
}) {
  const isMobile = useIsMobile()
  const [showFilters, setShowFilters] = useState(false)
  const firstLoad = list.loading && list.tickets.length === 0
  let body
  if (list.error) {
    body = (
      <Box sx={{ p: 2 }}>
        <ErrorState message={list.error.message} onRetry={list.reload} />
      </Box>
    )
  } else if (firstLoad) {
    body = <Skeleton variant="rectangular" sx={{ flex: 1, minHeight: 160 }} aria-label="Loading tickets" />
  } else if (list.tickets.length === 0) {
    body = (
      <Box sx={isMobile ? { py: 1 } : { p: 2, borderTop: 1, borderColor: 'divider' }}>
        <Typography gutterBottom>No tickets match these filters.</Typography>
        {filtersActive && (
          <Button onClick={onClearFilters} size="small">
            Clear filters
          </Button>
        )}
      </Box>
    )
  } else {
    body = (
      <Box aria-busy={list.loading} sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {list.loading && (
          <LinearProgress aria-label="Updating tickets" sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3 }} />
        )}
        <AdminTicketTable key={resetKey} tickets={list.tickets} />
      </Box>
    )
  }

  const caption = (
    <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary' }}>
      {VIEW_LABELS[filters.view]}
      {!firstLoad && !list.error && ` · ${list.tickets.length}`}
    </Typography>
  )
  const metricChip = metricLabel && (
    <Chip
      label={metricLabel}
      size="small"
      onDelete={onClearMetric}
      sx={{ bgcolor: '#E6F0F8', color: 'secondary.main', fontWeight: 500 }}
    />
  )
  const viewToggle = <ViewToggle value={filters.view} onChange={(view) => onChangeFilters({ ...filters, view })} />

  if (isMobile) {
    // A dot on the filters button while anything behind it is set (a non-default view or
    // any filter other than the search, which stays on screen).
    const hiddenFilterOn = filters.view !== 'active' || HIDDEN_FILTERS.some((name) => filters[name])
    return (
      <Box component="section" aria-labelledby="all-tickets-title" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography id="all-tickets-title" component="h2" sx={visuallyHiddenSx}>
          All tickets
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <SearchField value={filters.q} onChange={(event) => onChangeFilters({ ...filters, q: event.target.value })} tall />
          <IconButton
            aria-label={showFilters ? 'Hide filters' : 'Show filters'}
            aria-expanded={showFilters}
            aria-controls="all-tickets-filters"
            onClick={() => setShowFilters((open) => !open)}
            sx={{
              flex: 'none',
              width: 44,
              height: 44,
              borderRadius: 1,
              border: 1,
              borderColor: 'rgba(5,109,174,.5)',
              color: 'primary.main',
              bgcolor: showFilters ? '#F0F7FC' : 'background.paper',
            }}
          >
            <Badge color="primary" variant="dot" invisible={!hiddenFilterOn}>
              <TuneIcon />
            </Badge>
          </IconButton>
        </Box>
        <Collapse in={showFilters} unmountOnExit>
          <Box id="all-tickets-filters" sx={{ display: 'flex', flexDirection: 'column', gap: 1, pb: 0.5 }}>
            <Box>{viewToggle}</Box>
            <AdminTicketFilters
              values={filters}
              onChange={onChangeFilters}
              buildings={buildings}
              engineers={engineers}
              withSearch={false}
            />
          </Box>
        </Collapse>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {caption}
          {metricChip}
        </Box>
        {body}
      </Box>
    )
  }

  return (
    <Card component="section" aria-labelledby="all-tickets-title" sx={{ ...panelSx, flex: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, px: 2, pt: 1.5, pb: 1 }}>
        <Typography id="all-tickets-title" component="h2" sx={panelHeadingSx}>
          All tickets
        </Typography>
        {caption}
        {metricChip}
        <Box sx={{ ml: 'auto' }}>{viewToggle}</Box>
      </Box>
      <Box sx={{ px: 2, pb: 1.5 }}>
        <AdminTicketFilters values={filters} onChange={onChangeFilters} buildings={buildings} engineers={engineers} />
      </Box>
      {body}
    </Card>
  )
}

AllTicketsPanel.propTypes = {
  list: PropTypes.shape({
    tickets: PropTypes.array.isRequired,
    loading: PropTypes.bool.isRequired,
    error: PropTypes.instanceOf(Error),
    reload: PropTypes.func.isRequired,
  }).isRequired,
  filters: PropTypes.shape({
    view: PropTypes.oneOf(['active', 'closed', 'all']).isRequired,
    q: PropTypes.string.isRequired,
  }).isRequired,
  onChangeFilters: PropTypes.func.isRequired,
  // Changes whenever the filters do, so paging starts again on page one.
  resetKey: PropTypes.string.isRequired,
  // The selected metric card's label, shown as a chip that clears it.
  metricLabel: PropTypes.string,
  onClearMetric: PropTypes.func.isRequired,
  filtersActive: PropTypes.bool.isRequired,
  onClearFilters: PropTypes.func.isRequired,
  buildings: PropTypes.array.isRequired,
  engineers: PropTypes.array.isRequired,
}

export default AllTicketsPanel
