import { createContext } from 'react';

/**
 * @typedef {{ version: number, bump: () => void }} Refresh
 * `version` changes after any write; useApiGet reloads when it does.
 */

/** @type {import('react').Context<Refresh|null>} */
export const RefreshContext = createContext(null);
