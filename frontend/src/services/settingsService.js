import { request } from './apiClient';

/** Writes for Settings. Reads go through useApiGet('/departments'). */

/** @param {{ first_name?: string, last_name?: string, email?: string }} data the changed fields only */
export const updateMe = (data) => request('/me', { method: 'PATCH', body: data });

/** @param {{ name: string, prefix: string }} data admin creates a department */
export const createDepartment = (data) => request('/departments', { method: 'POST', body: data });

/** @param {number} id @param {{ name?: string, prefix?: string }} data */
export const updateDepartment = (id, data) => request(`/departments/${id}`, { method: 'PATCH', body: data });
