import PropTypes from 'prop-types';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';

/**
 * What a page shows before its data arrives: grey placeholders while loading,
 * or the error with a retry button.
 *
 * @param {{ error?: { message: string } | null, onRetry: () => void }} props
 */
export function LoadState({ error, onRetry }) {
  if (error) {
    return (
      <Alert
        severity="error"
        action={
          <Button variant="text" color="inherit" size="small" onClick={onRetry}>
            Try again
          </Button>
        }
      >
        {error.message}
      </Alert>
    );
  }
  return (
    <Box aria-busy="true" aria-label="Loading" sx={{ display: 'grid', gap: 3 }}>
      <Skeleton variant="rounded" height={110} />
      <Skeleton variant="rounded" height={160} />
      <Skeleton variant="rounded" height={280} />
    </Box>
  );
}

LoadState.propTypes = {
  error: PropTypes.shape({ message: PropTypes.string }),
  onRetry: PropTypes.func.isRequired,
};
