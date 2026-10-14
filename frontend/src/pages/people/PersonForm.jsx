import PropTypes from 'prop-types';
import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useAuth } from '../../context/useAuth';
import { createUser, updateEmployee, updateUser } from '../../services/peopleService';

const ROLES = [
  { value: 'employee', label: 'Employee' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' },
];

/**
 * Create or edit a person (prototype "Create user" / "Edit employee" drawer forms).
 * Admin sees every field, plus a temporary password when creating. A manager sees only
 * the first name, last name and email of a direct report (MANAGER.md §6.3).
 *
 * @param {{ person?: object, options?: { managers: {id:number,name:string}[], departments: {id:number,name:string,prefix:string}[] },
 *           onSaved: (person: object, password?: string) => void, onCancel: () => void }} props
 */
export function PersonForm({ person, options, onSaved, onCancel }) {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const [values, setValues] = useState({
    first_name: person?.first_name ?? '',
    last_name: person?.last_name ?? '',
    email: person?.email ?? '',
    job_title: person?.job_title ?? '',
    role: person?.role ?? 'employee',
    department_id: person?.department_id ?? options?.departments?.[0]?.id ?? '',
    manager_id: person?.manager_id ?? '',
    hourly_rate: person?.hourly_rate ?? '',
    password: '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (field) => (event) => setValues((v) => ({ ...v, [field]: event.target.value }));
  const reportsToManager = values.role === 'employee';
  // Unassigned by default: managers take people on from the employee list (WORKSHOP_NOTES.md).
  const managerId = values.manager_id ?? '';

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    const payload = { first_name: values.first_name, last_name: values.last_name, email: values.email };
    if (isAdmin) {
      Object.assign(payload, {
        job_title: values.job_title || null,
        role: values.role,
        department_id: values.department_id === '' ? null : Number(values.department_id),
        manager_id: reportsToManager && managerId !== '' ? Number(managerId) : null,
        hourly_rate: Number(values.hourly_rate || 0),
      });
    }
    try {
      let saved;
      if (!person) {
        saved = await createUser({ ...payload, password: values.password });
      } else if (isAdmin) {
        saved = await updateUser(person.id, payload);
      } else {
        saved = await updateEmployee(person.id, payload);
      }
      onSaved(saved, values.password);
    } catch (error) {
      setErrors(error.fields ?? { form: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box component="form" onSubmit={submit} sx={{ display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        <TextField label="First name" value={values.first_name} onChange={set('first_name')} required error={!!errors.first_name} helperText={errors.first_name} />
        <TextField label="Last name" value={values.last_name} onChange={set('last_name')} required error={!!errors.last_name} helperText={errors.last_name} />
      </Box>
      <TextField label="Email address" type="email" value={values.email} onChange={set('email')} required error={!!errors.email} helperText={errors.email} />
      {isAdmin && (
        <>
          <TextField label="Job title" value={values.job_title} onChange={set('job_title')} error={!!errors.job_title} helperText={errors.job_title} />
          <TextField select label="Role" value={values.role} onChange={set('role')} required error={!!errors.role} helperText={errors.role ?? (person ? 'A role change is refused while the current role still has projects, reports or open tasks.' : undefined)}>
            {ROLES.map((r) => (
              <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>
            ))}
          </TextField>
          <TextField select label="Department" value={values.department_id} onChange={set('department_id')} error={!!errors.department_id} helperText={errors.department_id}>
            <MenuItem value="">None</MenuItem>
            {(options?.departments ?? []).map((d) => (
              <MenuItem key={d.id} value={d.id}>{d.name} · {d.prefix}</MenuItem>
            ))}
          </TextField>
          {reportsToManager && (
            <TextField select label="Reports to" value={managerId} onChange={set('manager_id')} error={!!errors.manager_id} helperText={errors.manager_id ?? 'Usually left unassigned: managers take people on from the employee list. Set it here to move someone between managers.'}>
              <MenuItem value="">Unassigned</MenuItem>
              {(options?.managers ?? []).map((m) => (
                <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>
              ))}
            </TextField>
          )}
          <TextField label="Hourly rate (USD)" type="number" value={values.hourly_rate} onChange={set('hourly_rate')} required slotProps={{ htmlInput: { min: 0, step: 1 } }} error={!!errors.hourly_rate} helperText={errors.hourly_rate ?? 'Cost = logged hours × this rate.'} />
          {!person && (
            <TextField label="Temporary password" type="text" value={values.password} onChange={set('password')} required autoComplete="off" slotProps={{ htmlInput: { minLength: 8, maxLength: 128 } }} error={!!errors.password} helperText={errors.password ?? 'At least 8 characters. Shown once with the generated username after saving.'} />
          )}
        </>
      )}
      {!isAdmin && (
        <Typography variant="caption" color="text.secondary">
          Role, department, manager and rate are set by an administrator.
        </Typography>
      )}
      {errors.form && (
        <Typography variant="caption" color="error">
          {errors.form}
        </Typography>
      )}
      <Box sx={{ display: 'flex', gap: 1, pt: 1 }}>
        <Button type="submit" variant="contained" disabled={saving}>
          {saving ? 'Saving…' : person ? 'Save changes' : 'Create account'}
        </Button>
        <Button type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </Box>
    </Box>
  );
}

PersonForm.propTypes = {
  person: PropTypes.shape({
    id: PropTypes.number.isRequired,
    first_name: PropTypes.string,
    last_name: PropTypes.string,
    email: PropTypes.string,
    job_title: PropTypes.string,
    role: PropTypes.string,
    department_id: PropTypes.number,
    manager_id: PropTypes.number,
    hourly_rate: PropTypes.number,
  }),
  options: PropTypes.shape({
    managers: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.number, name: PropTypes.string })),
    departments: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.number, name: PropTypes.string, prefix: PropTypes.string })),
  }),
  onSaved: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};
