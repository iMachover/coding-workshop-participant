import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

/**
 * Page heading (prototype `Heading`): small upper-case eyebrow, title, one-line
 * subtitle, and the page's primary actions on the right.
 *
 * @param {{ eyebrow?: string, title: string, subtitle?: string, actions?: import('react').ReactNode }} props
 */
export function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'flex-start', sm: 'center' },
        justifyContent: 'space-between',
        gap: { xs: 1.875, sm: 1.5 },
        mb: { xs: 2.25, lg: 1.875 },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        {eyebrow && (
          <Typography variant="overline" color="text.secondary" component="p" sx={{ mb: 0.75, lineHeight: 1.2 }}>
            {eyebrow}
          </Typography>
        )}
        <Typography variant="h1">{title}</Typography>
        {subtitle && (
          <Typography color="text.secondary" sx={{ mt: 0.625 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {actions && <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>{actions}</Box>}
    </Box>
  );
}

PageHeader.propTypes = {
  eyebrow: PropTypes.string,
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  actions: PropTypes.node,
};
