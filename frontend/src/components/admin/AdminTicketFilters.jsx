import PropTypes from 'prop-types'
import FormControlLabel from '@mui/material/FormControlLabel'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import SearchIcon from '@mui/icons-material/Search'

import { CATEGORIES, PRIORITIES, STATUSES } from '../../utils/ticketFormat'

const ASSIGNMENTS = { unassigned: 'Unassigned', assigned: 'Assigned' }

/** A labelled dropdown whose first option ("All …") clears it. */
function FilterSelect({ label, allLabel, value, options, onChange, minWidth }) {
  return (
    <TextField select label={label} size="small" value={value} onChange={onChange} sx={{ minWidth }}>
      <MenuItem value="">{allLabel}</MenuItem>
      {options.map(([code, text]) => (
        <MenuItem key={code} value={code}>
          {text}
        </MenuItem>
      ))}
    </TextField>
  )
}

FilterSelect.propTypes = {
  label: PropTypes.string.isRequired,
  allLabel: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  options: PropTypes.arrayOf(PropTypes.arrayOf(PropTypes.string)).isRequired,
  onChange: PropTypes.func.isRequired,
  minWidth: PropTypes.number.isRequired,
}

/**
 * The admin's list controls: active/closed/all and search on top, then status,
 * priority, category, building, assignment, engineer and an escalated-only switch.
 * Everything stacks on small screens.
 */
function AdminTicketFilters({ values, onChange, buildings, engineers }) {
  const set = (name) => (event) => onChange({ ...values, [name]: event.target.value })

  return (
    <Stack spacing={2} sx={{ mb: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
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
          placeholder="Title, requester name or email, or ticket #"
          type="search"
          size="small"
          value={values.q}
          onChange={set('q')}
          sx={{ flexGrow: 1 }}
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
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} useFlexGap sx={{ flexWrap: 'wrap', alignItems: { md: 'center' } }}>
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
          label="Category"
          allLabel="All categories"
          value={values.category}
          options={Object.entries(CATEGORIES)}
          onChange={set('category')}
          minWidth={180}
        />
        <FilterSelect
          label="Building"
          allLabel="All buildings"
          value={values.building_id}
          options={buildings.map((b) => [String(b.building_id), b.building_name])}
          onChange={set('building_id')}
          minWidth={150}
        />
        <FilterSelect
          label="Assignment"
          allLabel="Assigned or not"
          value={values.assignment}
          options={Object.entries(ASSIGNMENTS)}
          onChange={set('assignment')}
          minWidth={160}
        />
        <FilterSelect
          label="Engineer"
          allLabel="Any engineer"
          value={values.assigned_to}
          options={engineers.map((e) => [String(e.user_id), e.full_name])}
          onChange={set('assigned_to')}
          minWidth={160}
        />
        <FormControlLabel
          control={
            <Switch
              checked={values.escalated}
              onChange={(event) => onChange({ ...values, escalated: event.target.checked })}
            />
          }
          label="Escalated only"
        />
      </Stack>
    </Stack>
  )
}

AdminTicketFilters.propTypes = {
  values: PropTypes.shape({
    view: PropTypes.oneOf(['active', 'closed', 'all']).isRequired,
    q: PropTypes.string.isRequired,
    status: PropTypes.string.isRequired,
    priority: PropTypes.string.isRequired,
    category: PropTypes.string.isRequired,
    building_id: PropTypes.string.isRequired,
    assignment: PropTypes.string.isRequired,
    assigned_to: PropTypes.string.isRequired,
    escalated: PropTypes.bool.isRequired,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
  buildings: PropTypes.arrayOf(
    PropTypes.shape({
      building_id: PropTypes.number.isRequired,
      building_name: PropTypes.string.isRequired,
    }),
  ).isRequired,
  engineers: PropTypes.arrayOf(
    PropTypes.shape({
      user_id: PropTypes.number.isRequired,
      full_name: PropTypes.string.isRequired,
    }),
  ).isRequired,
}

export default AdminTicketFilters
