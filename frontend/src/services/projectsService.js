import { request } from './apiClient';

/** Writes for the Projects page. Reads go through useApiGet('/projects'). */

/** @param {object} data name, description, department_id, manager_id, start_date, end_date, budget */
export const createProject = (data) => request('/projects', { method: 'POST', body: data });

/** @param {number} id @param {object} data the changed fields only */
export const updateProject = (id, data) => request(`/projects/${id}`, { method: 'PATCH', body: data });

/** @param {number} id */
export const archiveProject = (id) => request(`/projects/${id}/archive`, { method: 'POST' });

/** @param {number} id */
export const restoreProject = (id) => request(`/projects/${id}/restore`, { method: 'POST' });

/** Managers and departments for the admin's project form. */
export const fetchProjectOptions = () => request('/projects/options');
