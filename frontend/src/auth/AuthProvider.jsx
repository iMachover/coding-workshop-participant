import { useCallback, useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'

import { onUnauthorized } from '../services/apiClient'
import { clearSession, getSession, storeSession } from '../services/session'
import { AuthContext, SESSION_ENDED } from './AuthContext'

/**
 * Holds the signed-in user for the whole app. The access token itself stays in
 * services/session.js, where apiClient reads it for every request.
 */
function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getSession()?.user ?? null)
  // Why the last sign-out happened, for the sign-in page. Kept here rather than in
  // navigation state, because protected routes also redirect on sign-out.
  const [notice, setNotice] = useState(null)

  /** @param {{token: string, user: object}} session from authService.login */
  const signIn = useCallback((session) => {
    storeSession(session)
    setUser(session.user)
    setNotice(null)
  }, [])

  const signOut = useCallback((message = null) => {
    clearSession()
    setUser(null)
    setNotice(message)
  }, [])

  // If the API rejects our session, drop it; protected routes then send the user to sign in.
  useEffect(() => onUnauthorized(() => signOut(SESSION_ENDED)), [signOut])

  const value = useMemo(() => ({ user, notice, signIn, signOut }), [user, notice, signIn, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
}

export default AuthProvider
