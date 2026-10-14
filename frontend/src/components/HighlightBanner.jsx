import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { headingFont, monoFont, tokens } from '../theme';
import { Meter } from './Meter';

/**
 * The dark teal focus banner (prototype `.acme-focus`): what the user is focused on,
 * with a progress bar on the left and key figures on the right.
 * Status chips inside `meta` should pass `inverse`.
 *
 * @param {{ eyebrow: string, title: string, subtitle?: string, meta?: import('react').ReactNode,
 *           progress?: { label: string, valueLabel: string, percent: number },
 *           figures: { label: string, value: string }[], aside?: import('react').ReactNode }} props
 */
export function HighlightBanner({ eyebrow, title, subtitle, meta, progress, figures, aside }) {
  return (
    <Box
      component="section"
      aria-label={title}
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 220px', lg: 'minmax(0, 1fr) 290px' },
        gap: { xs: 2, md: 3.25 },
        px: { xs: 2.5, md: 2.75 },
        py: { xs: 2.5, md: 2 },
        mb: 2,
        borderRadius: '7px',
        bgcolor: tokens.banner,
        color: '#edf3e9',
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="overline" sx={{ color: '#b5c9b3' }} component="p">
          {eyebrow}
        </Typography>
        <Typography
          component="h2"
          sx={{ fontFamily: headingFont, fontSize: { xs: 21, lg: 20 }, fontWeight: 650, letterSpacing: '-0.7px', mt: 0.5 }}
        >
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="caption" component="p" sx={{ color: '#bed0c6', mt: 0.5 }}>
            {subtitle}
          </Typography>
        )}
        {meta && (
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 1.25,
              mt: 1.25,
              color: '#bed0c6',
              fontSize: 11,
            }}
          >
            {meta}
          </Box>
        )}
        {progress && (
          <Box sx={{ mt: 1.75 }}>
            <Meter inverse percent={progress.percent} label={progress.label} valueLabel={progress.valueLabel} />
          </Box>
        )}
      </Box>

      <Box
        sx={{
          borderLeft: { md: '1px solid #52716c' },
          borderTop: { xs: '1px solid #52716c', md: 0 },
          pl: { md: 3 },
          pt: { xs: 2, md: 0 },
          display: 'grid',
          alignContent: 'center',
          gap: 1.4,
        }}
      >
        {figures.map(({ label, value }) => (
          <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.25 }}>
            <Typography variant="caption" sx={{ color: '#c9d6cb', whiteSpace: 'nowrap' }}>
              {label}
            </Typography>
            <Typography
              variant="caption"
              sx={{ fontFamily: monoFont, fontWeight: 500, color: '#f0f5e6', textAlign: 'right' }}
            >
              {value}
            </Typography>
          </Box>
        ))}
        {aside}
      </Box>
    </Box>
  );
}

HighlightBanner.propTypes = {
  eyebrow: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  meta: PropTypes.node,
  progress: PropTypes.shape({
    label: PropTypes.string.isRequired,
    valueLabel: PropTypes.string.isRequired,
    percent: PropTypes.number.isRequired,
  }),
  figures: PropTypes.arrayOf(PropTypes.shape({ label: PropTypes.string, value: PropTypes.string })).isRequired,
  aside: PropTypes.node,
};
