import { useContext } from 'react';
import { RefreshContext } from './refreshContext';

/**
 * `{ version, bump }`: call bump() after a write so lists and panels reload.
 * Must be used inside <RefreshProvider>.
 * @returns {import('./refreshContext').Refresh}
 */
export function useRefresh() {
  const context = useContext(RefreshContext);
  if (!context) {
    throw new Error('useRefresh must be used within a RefreshProvider');
  }
  return context;
}
