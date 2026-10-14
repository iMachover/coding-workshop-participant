import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';

/**
 * Thin progress bar with an optional label on the left and value on the right.
 * `warn` colours it amber (over capacity, at risk).
 *
 * @param {{ percent: number, label?: string, valueLabel?: string, warn?: boolean, inverse?: boolean }} props
 *   `inverse` is for use on the dark banner.
 */
export function Meter({ percent, label, valueLabel, warn = false, inverse = false }) {
  const value = Math.max(0, Math.min(100, percent));
  const textColor = inverse ? '#c9d6cb' : 'text.secondary';
  const barColor = warn ? '#be9451' : inverse ? '#c3d28a' : '#508271';

  return (
    <Box>
      {(label || valueLabel) && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5, mb: 0.75 }}>
          <Typography variant="caption" sx={{ color: textColor, fontSize: 10 }}>
            {label}
          </Typography>
          <Typography variant="caption" sx={{ color: textColor, fontSize: 10, whiteSpace: 'nowrap' }}>
            {valueLabel}
          </Typography>
        </Box>
      )}
      <LinearProgress
        variant="determinate"
        value={value}
        aria-label={label}
        sx={{
          height: inverse ? 7 : 5,
          minWidth: 70,
          borderRadius: 1,
          bgcolor: inverse ? '#3a6260' : '#e6ece3',
          '& .MuiLinearProgress-bar': { borderRadius: 1, bgcolor: barColor },
        }}
      />
    </Box>
  );
}

Meter.propTypes = {
  percent: PropTypes.number.isRequired,
  label: PropTypes.string,
  valueLabel: PropTypes.string,
  warn: PropTypes.bool,
  inverse: PropTypes.bool,
};
