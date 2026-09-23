import PropTypes from 'prop-types'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import SearchIcon from '@mui/icons-material/Search'

import { STATUSES, URGENCIES } from '../../utils/ticketFormat'

/**
 * One row of list controls: active/closed/all, search, status and urgency.
 * Stacks vertically on small screens.
 */
function TicketFilters({ values, onChange }) {
  const set = (name) => (event) => onChange({ ...values, [name]: event.target.value })

  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
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
        placeholder="Title, description or ticket #"
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

      <TextField select label="Status" size="small" value={values.status} onChange={set('status')} sx={{ minWidth: 160 }}>
        <MenuItem value="">All statuses</MenuItem>
        {Object.entries(STATUSES).map(([code, { label }]) => (
          <MenuItem key={code} value={code}>
            {label}
          </MenuItem>
        ))}
      </TextField>

      <TextField select label="Urgency" size="small" value={values.urgency} onChange={set('urgency')} sx={{ minWidth: 140 }}>
        <MenuItem value="">All urgencies</MenuItem>
        {Object.entries(URGENCIES).map(([code, { label }]) => (
          <MenuItem key={code} value={code}>
            {label}
          </MenuItem>
        ))}
      </TextField>
    </Stack>
  )
}

TicketFilters.propTypes = {
  values: PropTypes.shape({
    view: PropTypes.oneOf(['active', 'closed', 'all']).isRequired,
    status: PropTypes.string.isRequired,
    urgency: PropTypes.string.isRequired,
    q: PropTypes.string.isRequired,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
}

export default TicketFilters
