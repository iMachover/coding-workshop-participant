import PropTypes from 'prop-types'
import Box from '@mui/material/Box'
import FormControlLabel from '@mui/material/FormControlLabel'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import SearchIcon from '@mui/icons-material/Search'

import { buildingFilterOptions } from '../../utils/facilities'
import { CATEGORIES, PRIORITIES, STATUSES } from '../../utils/ticketFormat'

const CONTROL_HEIGHT = 34

/**
 * A compact dropdown that shows its own name while nothing is chosen, as in the mockup;
 * the name is also its accessible name. The first option ("All …") clears it.
 */
function CompactSelect({ label, allLabel, value, options, onChange }) {
  const chosen = options.find(([code]) => code === value)
  return (
    <Select
      size="small"
      displayEmpty
      value={value}
      onChange={onChange}
      inputProps={{ 'aria-label': label }}
      renderValue={() => chosen?.[1] ?? <Box component="span" sx={{ color: 'text.secondary' }}>{label}</Box>}
      sx={{
        height: CONTROL_HEIGHT,
        fontSize: 13,
        bgcolor: 'background.paper',
        maxWidth: 200,
        '& .MuiSelect-select': { py: 0, pl: 1.25 },
      }}
    >
      <MenuItem value="">{allLabel}</MenuItem>
      {options.map(([code, text]) => (
        <MenuItem key={code} value={code}>
          {text}
        </MenuItem>
      ))}
    </Select>
  )
}

CompactSelect.propTypes = {
  label: PropTypes.string.isRequired,
  allLabel: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  options: PropTypes.arrayOf(PropTypes.arrayOf(PropTypes.string)).isRequired,
  onChange: PropTypes.func.isRequired,
}

/**
 * Search by ticket number, title or requester. `tall` is the 44px phone version.
 */
export function SearchField({ value, onChange, tall = false }) {
  return (
    <TextField
      type="search"
      size="small"
      placeholder="Search #, title or requester"
      value={value}
      onChange={onChange}
      sx={{
        width: tall ? '100%' : { xs: '100%', sm: 260 },
        '& .MuiInputBase-root': { height: tall ? 44 : CONTROL_HEIGHT, fontSize: tall ? 14 : 13, bgcolor: 'background.paper' },
      }}
      slotProps={{
        htmlInput: { 'aria-label': 'Search' },
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon aria-hidden="true" fontSize="small" />
            </InputAdornment>
          ),
        },
      }}
    />
  )
}

SearchField.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  tall: PropTypes.bool,
}

/** Active / Closed / All tickets, as a small segmented control for the panel's header. */
export function ViewToggle({ value, onChange }) {
  return (
    <ToggleButtonGroup
      value={value}
      exclusive
      size="small"
      color="primary"
      aria-label="Which tickets"
      onChange={(_event, view) => view && onChange(view)}
      sx={{ '& .MuiToggleButton-root': { py: 0.25, px: 1.5, fontSize: 13, fontWeight: 600 } }}
    >
      <ToggleButton value="active">Active</ToggleButton>
      <ToggleButton value="closed">Closed</ToggleButton>
      <ToggleButton value="all">All</ToggleButton>
    </ToggleButtonGroup>
  )
}

ViewToggle.propTypes = {
  value: PropTypes.oneOf(['active', 'closed', 'all']).isRequired,
  onChange: PropTypes.func.isRequired,
}

/**
 * The admin's list filters in one wrapping row: search, then status, priority, category,
 * building and engineer dropdowns, then an escalated-only switch. Unassigned tickets are
 * reached from the Unassigned metric card, so there's no assignment dropdown here.
 * `withSearch={false}` leaves the search out, for phones, where it sits above the
 * collapsible filters.
 */
function AdminTicketFilters({ values, onChange, buildings, engineers, withSearch = true }) {
  const set = (name) => (event) => onChange({ ...values, [name]: event.target.value })

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
      {withSearch && <SearchField value={values.q} onChange={set('q')} />}
      <CompactSelect
        label="Status"
        allLabel="All statuses"
        value={values.status}
        options={Object.entries(STATUSES).map(([code, { label }]) => [code, label])}
        onChange={set('status')}
      />
      <CompactSelect
        label="Priority"
        allLabel="All priorities"
        value={values.priority}
        options={Object.entries(PRIORITIES).map(([code, { label, description }]) => [code, `${label} · ${description}`])}
        onChange={set('priority')}
      />
      <CompactSelect
        label="Category"
        allLabel="All categories"
        value={values.category}
        options={Object.entries(CATEGORIES)}
        onChange={set('category')}
      />
      <CompactSelect
        label="Building"
        allLabel="All buildings"
        value={values.building_id}
        options={buildingFilterOptions(buildings)}
        onChange={set('building_id')}
      />
      <CompactSelect
        label="Engineer"
        allLabel="Any engineer"
        value={values.assigned_to}
        options={engineers.map((e) => [String(e.user_id), e.full_name])}
        onChange={set('assigned_to')}
      />
      <FormControlLabel
        sx={{ ml: 0.5, mr: 0, '& .MuiFormControlLabel-label': { fontSize: 13 } }}
        control={
          <Switch
            size="small"
            checked={values.escalated}
            onChange={(event) => onChange({ ...values, escalated: event.target.checked })}
          />
        }
        label="Escalated only"
      />
    </Box>
  )
}

AdminTicketFilters.propTypes = {
  values: PropTypes.shape({
    q: PropTypes.string.isRequired,
    status: PropTypes.string.isRequired,
    priority: PropTypes.string.isRequired,
    category: PropTypes.string.isRequired,
    building_id: PropTypes.string.isRequired,
    assigned_to: PropTypes.string.isRequired,
    escalated: PropTypes.bool.isRequired,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
  // From GET /admin/facilities, so inactive buildings (marked) can still be filtered by.
  buildings: PropTypes.arrayOf(
    PropTypes.shape({
      building_id: PropTypes.number.isRequired,
      building_name: PropTypes.string.isRequired,
      is_active: PropTypes.bool.isRequired,
    }),
  ).isRequired,
  engineers: PropTypes.arrayOf(
    PropTypes.shape({
      user_id: PropTypes.number.isRequired,
      full_name: PropTypes.string.isRequired,
    }),
  ).isRequired,
  withSearch: PropTypes.bool,
}

export default AdminTicketFilters
