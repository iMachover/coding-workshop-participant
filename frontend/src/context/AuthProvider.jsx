import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { AuthContext } from './authContext';
import { getToken, setToken, setUnauthorizedHandler } from '../services/apiClient';
import { fetchMe, login as loginRequest } from '../services/authService';

/**
 * Holds the signed-in user and exposes login/logout to the whole app.
 *
 * On first render, a stored token is validated against GET /me so a stale or
 * expired token sends the user back to the login page instead of showing a
 * broken dashboard.
 *
 * @param {{ children: import('react').ReactNode }} props
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(getToken() ? 'loading' : 'anonymous');

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setStatus('anonymous');
  }, []);

  const login = useCallback(async (username, password) => {
    const data = await loginRequest(username, password);
    setToken(data.token);
    setUser(data.user);
    setStatus('authenticated');
    return data.user;
  }, []);

  // Any 401 from the API (expired/invalid token, archived account) ends the session.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // Validate a remembered token once on start-up.
  useEffect(() => {
    if (status !== 'loading') {
      return undefined;
    }
    let cancelled = false;
    fetchMe()
      .then((me) => {
        if (!cancelled) {
          setUser(me);
          setStatus('authenticated');
        }
      })
      .catch(() => {
        if (!cancelled) {
          logout();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [status, logout]);

  // Settings saves the person's own name or email; the sidebar and headers follow at once.
  const updateUser = useCallback((me) => setUser((current) => ({ ...current, ...me })), []);

  const value = useMemo(() => ({ status, user, login, logout, updateUser }), [status, user, login, logout, updateUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
