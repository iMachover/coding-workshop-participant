import { useCallback, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { RefreshContext } from './refreshContext';

/**
 * Lets any component announce "data changed" so every useApiGet on screen reloads.
 * Panels call bump() after a successful write; the page behind them refreshes too.
 *
 * @param {{ children: import('react').ReactNode }} props
 */
export function RefreshProvider({ children }) {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((n) => n + 1), []);
  const value = useMemo(() => ({ version, bump }), [version, bump]);
  return <RefreshContext.Provider value={value}>{children}</RefreshContext.Provider>;
}

RefreshProvider.propTypes = { children: PropTypes.node.isRequired };
