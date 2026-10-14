import { request } from './apiClient';

/** Writes for People & access (admin), My team (manager) and teams. Reads go through useApiGet. */

/** @param {object} data first_name, last_name, email, job_title, role, department_id, manager_id, hourly_rate, password */
export const createUser = (data) => request('/users', { method: 'POST', body: data });

/** @param {number} id @param {object} data the changed fields only (admin) */
export const updateUser = (id, data) => request(`/users/${id}`, { method: 'PATCH', body: data });

/** @param {number} id admin archives a person; their login stops at once */
export const archiveUser = (id) => request(`/users/${id}/archive`, { method: 'POST' });

/** @param {number} id */
export const restoreUser = (id) => request(`/users/${id}/restore`, { method: 'POST' });

/** Managers and departments for the admin's person form. */
export const fetchUserOptions = () => request('/users/options');

/** @param {number} id @param {object} data first_name, last_name, email of a direct report (manager) */
export const updateEmployee = (id, data) => request(`/employees/${id}`, { method: 'PATCH', body: data });

/** @param {number} id manager takes an unassigned employee on as a direct report */
export const assignEmployee = (id) => request(`/employees/${id}/assign`, { method: 'POST' });

/** @param {number} id manager releases a direct report to the unassigned pool and off their teams */
export const releaseEmployee = (id) => request(`/employees/${id}/release`, { method: 'POST' });

/** @param {object} data name, member_ids, project_id */
export const createTeam = (data) => request('/teams', { method: 'POST', body: data });

/** @param {number} id @param {string} name */
export const renameTeam = (id, name) => request(`/teams/${id}`, { method: 'PATCH', body: { name } });

/** @param {number} teamId @param {number} userId a direct report, or an unassigned employee who becomes one */
export const addTeamMember = (teamId, userId) => request(`/teams/${teamId}/members/${userId}`, { method: 'POST' });

/** @param {number} teamId @param {number} userId */
export const removeTeamMember = (teamId, userId) => request(`/teams/${teamId}/members/${userId}`, { method: 'DELETE' });

/** @param {number} projectId @param {number} teamId both the manager's own */
export const attachTeam = (projectId, teamId) => request(`/projects/${projectId}/teams/${teamId}`, { method: 'POST' });

/** @param {number} projectId @param {number} teamId */
export const detachTeam = (projectId, teamId) => request(`/projects/${projectId}/teams/${teamId}`, { method: 'DELETE' });

/** Job titles for the people picker and projects a team can work on (manager). */
export const fetchTeamOptions = () => request('/teams/options');

/**
 * People picker search (manager): the first 25 of my own and unassigned employees by name,
 * optional exact job title, minus the members of `exclude_team_id`. Never another manager's people.
 * @param {{ q?: string, job_title?: string, exclude_team_id?: number }} params
 */
export function searchEmployees(params) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, value);
  });
  const qs = query.toString();
  return request(`/employees/search${qs ? `?${qs}` : ''}`);
}
