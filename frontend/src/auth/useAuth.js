import { useContext } from 'react'

import { AuthContext } from './AuthContext'

/**
 * The signed-in user (or null), why the last sign-out happened, and the actions.
 * @returns {{
 *   user: object | null,
 *   notice: string | null,
 *   signIn: (session: {token: string, user: object}) => void,
 *   signOut: (message?: string) => void,
 * }}
 */
export default function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>')
  return auth
}
