import { request } from './apiClient';

/** Writes for the task and milestone workflow. Reads go through useApiGet. */

/** @param {number} id @param {'in_progress'|'submitted'} status employee, forward only */
export const updateTaskStatus = (id, status) => request(`/tasks/${id}`, { method: 'PATCH', body: { status } });

/** @param {number} id manager approves a submitted task */
export const completeTask = (id) => request(`/tasks/${id}/complete`, { method: 'POST' });

/** @param {number} id manager returns a submitted or completed task to in progress */
export const reopenTask = (id) => request(`/tasks/${id}/reopen`, { method: 'POST' });

/** @param {number} projectId @param {object} data name, description, start_date, projected_end_date, predicted_hours */
export const createMilestone = (projectId, data) => request(`/projects/${projectId}/milestones`, { method: 'POST', body: data });

/** @param {number} milestoneId @param {object} data title, description, predicted_hours, due_date, assigned_to */
export const createTask = (milestoneId, data) => request(`/milestones/${milestoneId}/tasks`, { method: 'POST', body: data });

/** @param {number} id manager approves a milestone once every task is completed */
export const approveMilestone = (id) => request(`/milestones/${id}/approve`, { method: 'POST' });

/** @param {number} id @param {string} text */
export const addNote = (id, text) => request(`/milestones/${id}/notes`, { method: 'POST', body: { note_text: text } });

/** @param {number} id manager closes a project once every milestone is approved */
export const closeProject = (id) => request(`/projects/${id}/close`, { method: 'POST' });
