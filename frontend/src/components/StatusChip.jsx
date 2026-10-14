import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import { TONES } from '../config/statuses';

/**
 * Small coloured label with a dot, e.g. "In progress" or "On track".
 *
 * @param {{ status: string, map: Object<string, { label: string, tone: string }>, inverse?: boolean }} props
 *   `map` is one of the tables in config/statuses.js; `inverse` is for the dark banner.
 */
export function StatusChip({ status, map, inverse = false }) {
  const { label, tone } = map[status] ?? { label: status, tone: 'neutral' };
  const colors = inverse ? { bg: '#396769', fg: '#e1ead8' } : (TONES[tone] ?? TONES.neutral);

  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.625,
        px: 0.875,
        py: 0.5,
        borderRadius: 0.8,
        bgcolor: colors.bg,
        color: colors.fg,
        fontSize: 10,
        fontWeight: 600,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
      }}
    >
      <Box component="span" aria-hidden="true" sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: 'currentColor' }} />
      {label}
    </Box>
  );
}

StatusChip.propTypes = {
  status: PropTypes.string.isRequired,
  map: PropTypes.objectOf(PropTypes.shape({ label: PropTypes.string, tone: PropTypes.string })).isRequired,
  inverse: PropTypes.bool,
};
