import PropTypes from 'prop-types';
import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useRefresh } from '../../context/useRefresh';
import { useToast } from '../../context/useToast';
import { useApiGet } from '../../hooks/useApiGet';
import { LoadState } from '../../components/LoadState';
import { SidePanel } from '../../components/SidePanel';
import { logHours } from '../../services/hoursService';
import { formatHours, localToday } from '../../utils/format';


/**
 * Log hours on one of my tasks (prototype "Log hours" drawer), mounted once in the shell and
 * opened with `?log=<task id>` (or `?log=0` to pick the task). Hours are recorded after the
 * work: a date not in the future, up to 24 h, with an optional note.
 *
 * @param {{ taskId: number|null, onClose: () => void }} props
 */
export function LogHoursPanel({ taskId, onClose }) {
  const open = taskId !== null;
  const { data, error, retry } = useApiGet(open ? '/me/time-entries' : null);
  const tasks = data?.loggable_tasks ?? [];

  return (
    <SidePanel open={open} title="Log hours" onClose={onClose}>
      {!data && <LoadState error={error} onRetry={retry} />}
      {data && tasks.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          Nothing to log hours on. Start one of your assigned tasks first; hours go on tasks in progress or awaiting approval.
        </Typography>
      )}
      {data && tasks.length > 0 && <LogHoursForm key={taskId} taskId={taskId} ledger={data} onClose={onClose} />}
    </SidePanel>
  );
}

/** The form itself; keyed by task so opening the panel again starts fresh. */
function LogHoursForm({ taskId, ledger, onClose }) {
  const { bump } = useRefresh();
  const showToast = useToast();
  const tasks = ledger.loggable_tasks;
  const preselected = tasks.some((t) => t.id === taskId) ? taskId : tasks[0].id;
  const [values, setValues] = useState({ task_id: preselected, work_date: localToday(), hours: '', note: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (field) => (event) => setValues((v) => ({ ...v, [field]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const saved = await logHours(Number(values.task_id), { work_date: values.work_date, hours: Number(values.hours), note: values.note || null });
      showToast(`${formatHours(saved.hours)} logged on ${saved.task_code}`);
      bump();
      onClose();
    } catch (err) {
      setErrors(err.fields ?? { form: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box component="form" onSubmit={submit} sx={{ display: 'grid', gap: 2 }}>
      <Typography variant="body2" color="text.secondary">
        Record the time after the work. There is no running timer. {formatHours(ledger.available_hours)} of this week&apos;s {formatHours(ledger.week.capacity_hours)} are still free.
      </Typography>
      <TextField select label="Task" value={values.task_id} onChange={set('task_id')} required helperText="Your tasks in progress or awaiting approval.">
        {tasks.map((t) => (
          <MenuItem key={t.id} value={t.id}>
            {t.code} · {t.title}
          </MenuItem>
        ))}
      </TextField>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        <TextField label="Date" type="date" value={values.work_date} onChange={set('work_date')} required slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: localToday() } }} error={!!errors.work_date} helperText={errors.work_date} />
        <TextField label="Hours" type="number" value={values.hours} onChange={set('hours')} required slotProps={{ htmlInput: { min: 0.25, max: 24, step: 0.25 } }} error={!!errors.hours} helperText={errors.hours ?? 'Up to 24 h in a day.'} />
      </Box>
      <TextField label="Work note" value={values.note} onChange={set('note')} multiline minRows={2} slotProps={{ htmlInput: { maxLength: 500 } }} error={!!errors.note} helperText={errors.note ?? 'Optional. What the time went on.'} />
      {errors.form && (
        <Typography variant="caption" color="error">
          {errors.form}
        </Typography>
      )}
      <Box sx={{ display: 'flex', gap: 1, pt: 1 }}>
        <Button type="submit" variant="contained" disabled={saving}>
          {saving ? 'Saving…' : 'Log hours'}
        </Button>
        <Button type="button" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
      </Box>
    </Box>
  );
}

LogHoursForm.propTypes = {
  taskId: PropTypes.number.isRequired,
  ledger: PropTypes.shape({
    available_hours: PropTypes.number,
    week: PropTypes.shape({ capacity_hours: PropTypes.number }),
    loggable_tasks: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.number, code: PropTypes.string, title: PropTypes.string })).isRequired,
  }).isRequired,
  onClose: PropTypes.func.isRequired,
};

LogHoursPanel.propTypes = {
  taskId: PropTypes.number,
  onClose: PropTypes.func.isRequired,
};
