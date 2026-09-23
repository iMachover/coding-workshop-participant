import { useCallback, useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'

import { onUnauthorized } from '../services/apiClient'
import { clearStoredUser, getStoredUser, storeUser } from '../services/session'
import { AuthContext, SESSION_ENDED } from './AuthContext'

/**
 * Holds the signed-in user for the whole app.
 *
 * DEV-ONLY: the "session" is the user object in localStorage (see services/session.js),
 * sent to the API as X-User-Id. It is not real authentication; JWT will replace it
 * without changing this component's interface.
 */
function AuthProvider({ children }) {
  const [user, setUser] = useState(getStoredUser)
  // Why the last sign-out happened, for the sign-in page. Kept here rather than in
  // navigation state, because protected routes also redirect on sign-out.
  const [notice, setNotice] = useState(null)

  const signIn = useCallback((signedInUser) => {
    storeUser(signedInUser)
    setUser(signedInUser)
    setNotice(null)
  }, [])

  const signOut = useCallback((message = null) => {
    clearStoredUser()
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
