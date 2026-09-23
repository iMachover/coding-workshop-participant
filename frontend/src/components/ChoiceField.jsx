import PropTypes from 'prop-types'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormHelperText from '@mui/material/FormHelperText'
import FormLabel from '@mui/material/FormLabel'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Typography from '@mui/material/Typography'

/**
 * A labelled group of radio options, each with an optional one-line hint.
 * Renders as a fieldset so screen readers announce the question with each option.
 */
function ChoiceField({ name, label, options, value, onChange, error, helperText, required, disabled }) {
  return (
    <FormControl component="fieldset" error={Boolean(error)} required={required} disabled={disabled}>
      <FormLabel component="legend">{label}</FormLabel>
      <RadioGroup name={name} value={value} onChange={(event) => onChange(name, event.target.value)}>
        {options.map((option) => (
          <FormControlLabel
            key={option.value}
            value={option.value}
            control={<Radio />}
            label={
              <span>
                {option.label}
                {option.hint && (
                  <Typography component="span" variant="body2" color="text.secondary">
                    {' '}
                    – {option.hint}
                  </Typography>
                )}
              </span>
            }
          />
        ))}
      </RadioGroup>
      <FormHelperText>{error || helperText || ' '}</FormHelperText>
    </FormControl>
  )
}

ChoiceField.propTypes = {
  name: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  options: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      hint: PropTypes.string,
    }),
  ).isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  error: PropTypes.string,
  helperText: PropTypes.string,
  required: PropTypes.bool,
  disabled: PropTypes.bool,
}

export default ChoiceField
