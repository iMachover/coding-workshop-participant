import { createContext } from 'react';

/**
 * @typedef {Object} AuthState
 * @property {'loading'|'authenticated'|'anonymous'} status
 * @property {object|null} user Public profile of the signed-in user
 * @property {(username: string, password: string) => Promise<object>} login
 * @property {() => void} logout
 */

/** @type {import('react').Context<AuthState|null>} */
export const AuthContext = createContext(null);
