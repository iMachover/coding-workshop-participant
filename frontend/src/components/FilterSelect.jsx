import PropTypes from 'prop-types'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'

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

export default FilterSelect
