import { createContext } from 'react';

/** @typedef {(message: string) => void} ShowToast */

/** @type {import('react').Context<ShowToast|null>} */
export const ToastContext = createContext(null);
