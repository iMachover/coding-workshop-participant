import { request } from './apiClient';

/** Writes for My hours. Reads go through useApiGet('/me/time-entries?from=&to='). */

/** @param {number} taskId @param {{ work_date: string, hours: number, note?: string|null }} data */
export const logHours = (taskId, data) => request(`/tasks/${taskId}/time-entries`, { method: 'POST', body: data });

/** @param {number} entryId @param {{ work_date?: string, hours?: number, note?: string|null }} data the changed fields only */
export const correctEntry = (entryId, data) => request(`/time-entries/${entryId}`, { method: 'PATCH', body: data });

/** @param {number} entryId */
export const deleteEntry = (entryId) => request(`/time-entries/${entryId}`, { method: 'DELETE' });

/** Build the ledger path for a Monday-to-Sunday week starting on `start` (YYYY-MM-DD). */
export const ledgerPath = (start, end) => `/me/time-entries?from=${start}&to=${end}`;
