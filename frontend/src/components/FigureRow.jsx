import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { monoFont } from '../theme';

/**
 * One "label ... value" line inside a side card, e.g. "Remaining  $110,165"
 * (prototype `.acme-inline-stat`).
 *
 * @param {{ label: string, value: string }} props
 */
export function FigureRow({ label, value }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        px: 2,
        py: { xs: 1.5, lg: 1.25 },
      }}
    >
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography sx={{ fontFamily: monoFont, fontSize: 15, fontWeight: 500 }}>
        {value}
      </Typography>
    </Box>
  );
}

FigureRow.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
};
