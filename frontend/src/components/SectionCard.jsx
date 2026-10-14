import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import LockOutlined from '@mui/icons-material/LockOutlined';
import { tokens } from '../theme';

/**
 * Bordered card (prototype `.acme-panel`) with a heading, optional count and subtitle,
 * the content, and an optional footer note shown with a lock icon (`.acme-note`).
 *
 * @param {{ title: string, count?: number, subtitle?: string, action?: import('react').ReactNode,
 *           footer?: string, children: import('react').ReactNode }} props
 */
export function SectionCard({ title, count, subtitle, action, footer, children }) {
  return (
    <Paper variant="outlined" component="section" aria-label={title} sx={{ overflow: 'hidden', minWidth: 0 }}>
      <Box
        sx={{
          display: 'flex',
          flexWrap: { xs: 'wrap', sm: 'nowrap' },
          alignItems: 'center',
          gap: 1.25,
          px: { xs: 1.9, lg: 2 },
          py: { xs: 1.6, lg: 1.4 },
        }}
      >
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h2">{title}</Typography>
            {count !== undefined && (
              <Box
                component="span"
                sx={{ px: 0.75, py: 0.25, borderRadius: 0.8, bgcolor: '#e6eddf', color: '#4d6c50', fontSize: 10 }}
              >
                {count}
              </Box>
            )}
          </Box>
          {subtitle && (
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.375 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {action}
      </Box>
      <Box sx={{ borderTop: 1, borderColor: 'divider' }}>{children}</Box>
      {footer && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 1.1,
            borderTop: 1,
            borderColor: 'divider',
            bgcolor: tokens.note,
            color: '#677b6b',
          }}
        >
          <LockOutlined sx={{ fontSize: 13 }} />
          <Typography variant="caption" sx={{ fontSize: 10 }}>
            {footer}
          </Typography>
        </Box>
      )}
    </Paper>
  );
}

SectionCard.propTypes = {
  title: PropTypes.string.isRequired,
  count: PropTypes.number,
  subtitle: PropTypes.string,
  action: PropTypes.node,
  footer: PropTypes.string,
  children: PropTypes.node.isRequired,
};
