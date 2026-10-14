import { useContext } from 'react';
import { ToastContext } from './toastContext';

/**
 * Returns `showToast(message)` for a short confirmation after an action, e.g. "Task submitted".
 * Must be used inside <ToastProvider>.
 * @returns {import('./toastContext').ShowToast}
 */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
