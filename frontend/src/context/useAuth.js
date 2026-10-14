import { useContext } from 'react';
import { AuthContext } from './authContext';

/**
 * Access the authentication state. Must be used inside <AuthProvider>.
 * @returns {import('./authContext').AuthState}
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
