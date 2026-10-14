import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import HelpOutlineOutlined from '@mui/icons-material/HelpOutlineOutlined';

/**
 * Message shown where a list or table has nothing to show (prototype `Empty`).
 *
 * @param {{ text: string }} props Say why it is empty and what to try next.
 */
export function EmptyState({ text }) {
  return (
    <Box sx={{ p: 3.75, textAlign: 'center', color: 'text.secondary', fontSize: 12 }}>
      <HelpOutlineOutlined sx={{ fontSize: 17, display: 'block', mx: 'auto', mb: 1 }} />
      {text}
    </Box>
  );
}

EmptyState.propTypes = {
  text: PropTypes.string.isRequired,
};
