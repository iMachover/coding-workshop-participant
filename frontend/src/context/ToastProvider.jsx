import { useCallback, useState } from 'react';
import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Snackbar from '@mui/material/Snackbar';
import CheckOutlined from '@mui/icons-material/CheckOutlined';
import { ToastContext } from './toastContext';

/**
 * Shows one confirmation message at a time, bottom centre, for 3.5 seconds
 * (prototype `Toast`). Screen readers hear it through the status role.
 *
 * @param {{ children: import('react').ReactNode }} props
 */
export function ToastProvider({ children }) {
  const [toast, setToast] = useState({ open: false, message: '', key: 0 });

  const showToast = useCallback((message) => {
    setToast((current) => ({ open: true, message, key: current.key + 1 }));
  }, []);

  const close = (_event, reason) => {
    if (reason !== 'clickaway') setToast((current) => ({ ...current, open: false }));
  };

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <Snackbar
        key={toast.key}
        open={toast.open}
        onClose={close}
        autoHideDuration={3500}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Box
          role="status"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            px: 2.75,
            py: 1.625,
            borderRadius: '6px',
            bgcolor: '#234d47',
            color: '#f4f7e8',
            fontSize: 12,
            boxShadow: '0 7px 25px #143c4124',
          }}
        >
          <CheckOutlined sx={{ fontSize: 17 }} />
          {toast.message}
        </Box>
      </Snackbar>
    </ToastContext.Provider>
  );
}

ToastProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
