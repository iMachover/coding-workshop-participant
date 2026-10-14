import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import CloseOutlined from '@mui/icons-material/CloseOutlined';

/**
 * Panel that slides in from the right for details and forms (prototype `Drawer`).
 * 460px wide on desktop, full width on phones. Escape or a click outside closes it.
 *
 * @param {{ open: boolean, title: string, onClose: () => void,
 *           children: import('react').ReactNode, footer?: import('react').ReactNode }} props
 *   `footer` holds the panel's buttons, below a divider.
 */
export function SidePanel({ open, title, onClose, children, footer }) {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: '100%', sm: 460 },
          maxWidth: '100vw',
          borderLeft: 1,
          borderColor: 'divider',
          boxShadow: '-15px 0 70px #153c411a',
        },
      }}
    >
      <Box sx={{ p: 3.25, fontSize: 12 }} role="dialog" aria-label={title}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            pb: 2.5,
            mb: 3,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Typography component="h2" sx={{ fontSize: 19, fontWeight: 650 }}>
            {title}
          </Typography>
          <IconButton onClick={onClose} aria-label="Close panel" size="small" sx={{ color: 'text.secondary' }}>
            <CloseOutlined sx={{ fontSize: 17 }} />
          </IconButton>
        </Box>
        {children}
        {footer && (
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 1,
              mt: 3.25,
              pt: 2.25,
              borderTop: 1,
              borderColor: 'divider',
            }}
          >
            {footer}
          </Box>
        )}
      </Box>
    </Drawer>
  );
}

SidePanel.propTypes = {
  open: PropTypes.bool.isRequired,
  title: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
  footer: PropTypes.node,
};
