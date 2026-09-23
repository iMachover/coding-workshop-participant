import PropTypes from 'prop-types'
import InputAdornment from '@mui/material/InputAdornment'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import SearchIcon from '@mui/icons-material/Search'

import { PRIORITIES, STATUSES } from '../../utils/ticketFormat'
import FilterSelect from '../FilterSelect'

/**
 * The engineer's list controls: active/closed/all, search, status, priority and
 * building. Stacks vertically on small screens.
 */
function EngineerQueueFilters({ values, onChange, buildings }) {
  const set = (name) => (event) => onChange({ ...values, [name]: event.target.value })

  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} useFlexGap sx={{ mb: 2, flexWrap: 'wrap' }}>
      <ToggleButtonGroup
        value={values.view}
        exclusive
        size="small"
        aria-label="Which tickets"
        onChange={(_event, view) => view && onChange({ ...values, view })}
      >
        <ToggleButton value="active">Active</ToggleButton>
        <ToggleButton value="closed">Closed</ToggleButton>
        <ToggleButton value="all">All</ToggleButton>
      </ToggleButtonGroup>

      <TextField
        label="Search"
        placeholder="Title, requester or ticket #"
        type="search"
        size="small"
        value={values.q}
        onChange={set('q')}
        sx={{ flexGrow: 1, minWidth: 200 }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon aria-hidden="true" />
              </InputAdornment>
            ),
          },
        }}
      />

      <FilterSelect
        label="Status"
        allLabel="All statuses"
        value={values.status}
        options={Object.entries(STATUSES).map(([code, { label }]) => [code, label])}
        onChange={set('status')}
        minWidth={150}
      />
      <FilterSelect
        label="Priority"
        allLabel="All priorities"
        value={values.priority}
        options={Object.entries(PRIORITIES).map(([code, { label, description }]) => [code, `${label} · ${description}`])}
        onChange={set('priority')}
        minWidth={150}
      />
      <FilterSelect
        label="Building"
        allLabel="All buildings"
        value={values.building_id}
        options={buildings.map((b) => [String(b.building_id), b.building_name])}
        onChange={set('building_id')}
        minWidth={150}
      />
    </Stack>
  )
}

EngineerQueueFilters.propTypes = {
  values: PropTypes.shape({
    view: PropTypes.oneOf(['active', 'closed', 'all']).isRequired,
    q: PropTypes.string.isRequired,
    status: PropTypes.string.isRequired,
    priority: PropTypes.string.isRequired,
    building_id: PropTypes.string.isRequired,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
  buildings: PropTypes.arrayOf(
    PropTypes.shape({
      building_id: PropTypes.number.isRequired,
      building_name: PropTypes.string.isRequired,
    }),
  ).isRequired,
}

export default EngineerQueueFilters
