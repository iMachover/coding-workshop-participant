import { createContext } from 'react'

/** Signed-in user plus signIn/signOut. Provided by AuthProvider, read with useAuth. */
export const AuthContext = createContext(null)

/** Shown on the sign-in page when the API rejects the current session. */
export const SESSION_ENDED = 'Your session has ended. Please sign in again.'
