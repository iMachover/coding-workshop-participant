import PropTypes from 'prop-types';
import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useAuth } from '../../context/useAuth';
import { useToast } from '../../context/useToast';
import { createProject, updateProject } from '../../services/projectsService';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Create or edit a project (prototype "New project" / "Edit project" drawer form).
 * Admin sees every field incl. the accountable manager and, when creating, the department.
 * Managers see only name, description, dates and budget (MANAGER.md §7).
 *
 * @param {{ project?: object, options?: { managers: {id:number,name:string}[], departments: {id:number,name:string,prefix:string}[] },
 *           onSaved: (project: object) => void, onCancel: () => void }} props
 */
export function ProjectForm({ project, options, onSaved, onCancel }) {
  const { user } = useAuth();
  const showToast = useToast();
  const isAdmin = user.role === 'admin';
  const [values, setValues] = useState({
    name: project?.name ?? '',
    description: project?.description ?? '',
    department_id: project?.department_id ?? options?.departments?.[0]?.id ?? '',
    manager_id: project?.manager_id ?? options?.managers?.[0]?.id ?? '',
    start_date: project?.start_date ?? today(),
    end_date: project?.end_date ?? '',
    budget: project?.budget ?? '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (field) => (event) => setValues((v) => ({ ...v, [field]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    const payload = {
      name: values.name,
      description: values.description || null,
      start_date: values.start_date,
      end_date: values.end_date,
      budget: Number(values.budget),
    };
    if (isAdmin) payload.manager_id = Number(values.manager_id);
    if (isAdmin && !project) payload.department_id = Number(values.department_id);
    try {
      const saved = project ? await updateProject(project.id, payload) : await createProject(payload);
      showToast(project ? 'Project saved' : `Project ${saved.code} created`);
      onSaved(saved);
    } catch (error) {
      setErrors(error.fields ?? { form: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box component="form" onSubmit={submit} sx={{ display: 'grid', gap: 2 }}>
      <TextField label="Project name" value={values.name} onChange={set('name')} required error={!!errors.name} helperText={errors.name} />
      <TextField label="Description" value={values.description} onChange={set('description')} multiline minRows={2} error={!!errors.description} helperText={errors.description} />
      {isAdmin && !project && (
        <TextField select label="Department" value={values.department_id} onChange={set('department_id')} required error={!!errors.department_id} helperText={errors.department_id ?? 'The project code uses the department prefix.'}>
          {(options?.departments ?? []).map((d) => (
            <MenuItem key={d.id} value={d.id}>{d.name} · {d.prefix}</MenuItem>
          ))}
        </TextField>
      )}
      {isAdmin && (
        <TextField select label="Accountable manager" value={values.manager_id} onChange={set('manager_id')} required error={!!errors.manager_id} helperText={errors.manager_id ?? 'Exactly one manager owns each project.'}>
          {(options?.managers ?? []).map((m) => (
            <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>
          ))}
        </TextField>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        <TextField label="Start date" type="date" value={values.start_date} onChange={set('start_date')} required slotProps={{ inputLabel: { shrink: true } }} error={!!errors.start_date} helperText={errors.start_date} />
        <TextField label="Predicted end date" type="date" value={values.end_date} onChange={set('end_date')} required slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: values.start_date } }} error={!!errors.end_date} helperText={errors.end_date} />
      </Box>
      <TextField label="Planned budget (USD)" type="number" value={values.budget} onChange={set('budget')} required slotProps={{ htmlInput: { min: 0, step: 1 } }} error={!!errors.budget} helperText={errors.budget} />
      {!isAdmin && (
        <Typography variant="caption" color="text.secondary">
          The accountable manager is set by an administrator.
        </Typography>
      )}
      {errors.form && (
        <Typography variant="caption" color="error">
          {errors.form}
        </Typography>
      )}
      <Box sx={{ display: 'flex', gap: 1, pt: 1 }}>
        <Button type="submit" variant="contained" disabled={saving}>
          {saving ? 'Saving…' : project ? 'Save changes' : 'Create project'}
        </Button>
        <Button type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </Box>
    </Box>
  );
}

ProjectForm.propTypes = {
  project: PropTypes.shape({
    id: PropTypes.number.isRequired,
    name: PropTypes.string,
    description: PropTypes.string,
    department_id: PropTypes.number,
    manager_id: PropTypes.number,
    start_date: PropTypes.string,
    end_date: PropTypes.string,
    budget: PropTypes.number,
  }),
  options: PropTypes.shape({
    managers: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.number, name: PropTypes.string })),
    departments: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.number, name: PropTypes.string, prefix: PropTypes.string })),
  }),
  onSaved: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};
