import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { headingFont } from '../theme';

/**
 * Row of headline figures at the top of a page (prototype `.acme-stats`): label with an
 * icon, big value, one line of detail. Four across on wide screens, two on phones.
 *
 * @param {{ items: { label: string, value: string, detail?: import('react').ReactNode,
 *           icon?: import('react').ElementType }[] }} props
 */
export function StatCards({ items }) {
  return (
    <Paper
      variant="outlined"
      component="section"
      aria-label="Summary"
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: `repeat(${items.length}, minmax(0, 1fr))` },
        mb: 2,
        overflow: 'hidden',
      }}
    >
      {items.map(({ label, value, detail, icon: Icon }) => (
        <Box
          key={label}
          sx={{
            px: { xs: 2, lg: 2.25 },
            py: { xs: 2, lg: 1.5 },
            minWidth: 0,
            // Hairlines between cells; the outer border comes from the Paper.
            boxShadow: (theme) => `-1px -1px 0 ${theme.palette.divider}`,
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
              {label}
            </Typography>
            {Icon && <Icon sx={{ fontSize: 15, color: '#7c9387' }} />}
          </Box>
          <Typography
            sx={{
              fontFamily: headingFont,
              fontSize: { xs: 25, lg: 26 },
              fontWeight: 600,
              letterSpacing: '-1px',
              lineHeight: 1.3,
              fontVariantNumeric: 'tabular-nums',
              my: 0.5,
            }}
          >
            {value}
          </Typography>
          {detail && (
            <Typography
              variant="caption"
              color="text.secondary"
              component="p"
              sx={{ '& strong': { color: '#3a7054', fontWeight: 500 } }}
            >
              {detail}
            </Typography>
          )}
        </Box>
      ))}
    </Paper>
  );
}

StatCards.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      value: PropTypes.string.isRequired,
      detail: PropTypes.node,
      icon: PropTypes.elementType,
    }),
  ).isRequired,
};
