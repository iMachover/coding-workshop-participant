import PropTypes from 'prop-types';
import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddOutlined from '@mui/icons-material/AddOutlined';
import CheckOutlined from '@mui/icons-material/CheckOutlined';
import { useAuth } from '../../context/useAuth';
import { useRefresh } from '../../context/useRefresh';
import { useToast } from '../../context/useToast';
import { useApiGet } from '../../hooks/useApiGet';
import { MILESTONE_STATUS, TASK_STATUS } from '../../config/statuses';
import { EmptyState } from '../../components/EmptyState';
import { LoadState } from '../../components/LoadState';
import { Meter } from '../../components/Meter';
import { PersonCell } from '../../components/PersonCell';
import { SidePanel } from '../../components/SidePanel';
import { StatusChip } from '../../components/StatusChip';
import { addNote, approveMilestone, createTask } from '../../services/workService';
import { monoFont } from '../../theme';
import { formatDate, formatDay, formatHours, formatMoney, formatWhen } from '../../utils/format';

/**
 * One milestone: figures, its tasks (employees see only their own), the note conversation,
 * and for the manager: add a task, approve the milestone.
 *
 * @param {{ milestoneId: number|null, onClose: () => void, onOpenTask: (id: number) => void }} props
 */
export function MilestonePanel({ milestoneId, onClose, onOpenTask }) {
  const { user } = useAuth();
  const { bump } = useRefresh();
  const showToast = useToast();
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState('');
  const { data, error, loading, retry } = useApiGet(milestoneId ? `/milestones/${milestoneId}` : null);
  const ms = loading ? null : data;
  const state = ms ? (ms.locked ? 'locked' : ms.status) : null;
  const manages = user.role === 'manager' && ms?.manager_id === user.id;

  async function act(fn, message) {
    setBusy(true);
    try {
      await fn();
      showToast(message);
      bump();
      return true;
    } catch (err) {
      showToast(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function postNote(event) {
    event.preventDefault();
    if (await act(() => addNote(ms.id, note), 'Note added')) setNote('');
  }

  return (
    <SidePanel open={milestoneId !== null} title={ms ? `${String(ms.sequence).padStart(2, '0')} · ${ms.name}` : 'Milestone'} onClose={onClose}>
      {!ms && <LoadState error={error} onRetry={retry} />}
      {ms && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
            <StatusChip status={state} map={MILESTONE_STATUS} />
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
              {ms.project_code} · {ms.project_name}
            </Typography>
          </Box>
          {ms.description && (
            <Typography sx={{ mt: 1.5, fontSize: 12 }} color="text.secondary">
              {ms.description}
            </Typography>
          )}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2.25, my: 3 }}>
            <Detail label="Planned / actual hours" value={`${formatHours(ms.planned_hours)} / ${formatHours(ms.actual_hours)}`} />
            <Detail label="Planned / actual cost" value={`${formatMoney(ms.planned_cost)} / ${formatMoney(ms.actual_cost)}`} />
            <Detail label="Deadline" value={formatDate(ms.projected_end_date)} />
            <Detail label={ms.completed_at ? 'Approved' : 'Progress'} value={ms.completed_at ? formatWhen(ms.completed_at) : `${ms.progress.completed} / ${ms.progress.total} tasks · ${ms.progress.percent}%`} />
          </Box>
          <Meter percent={ms.progress.percent} />

          <Box sx={{ mt: 2, p: 1.75, bgcolor: '#eff3e5', color: '#4c6954', borderRadius: '5px', fontSize: 12 }}>
            {ms.locked
              ? 'Locked until the milestone before it is completed and approved. No work can start here yet.'
              : ms.status === 'completed'
                ? 'Approved. Every task was completed and the next milestone is unlocked.'
                : user.role === 'employee'
                  ? 'Your tasks in this milestone are listed below. Submit each one for approval when done.'
                  : 'Approve this milestone once every task in it is approved; that unlocks the next one.'}
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 3, mb: 1.5, gap: 1 }}>
            <Typography variant="h3">{user.role === 'employee' ? 'Your tasks' : 'Tasks'}</Typography>
            {manages && ms.status !== 'completed' && !adding && (
              <Button size="small" startIcon={<AddOutlined />} onClick={() => setAdding(true)}>
                Add task
              </Button>
            )}
          </Box>
          {adding && (
            <TaskForm
              milestone={ms}
              onSaved={(saved) => {
                setAdding(false);
                showToast(`Task ${saved.code} created`);
                bump();
              }}
              onCancel={() => setAdding(false)}
            />
          )}
          {ms.tasks.length === 0 ? (
            <EmptyState text={user.role === 'employee' ? 'None of your tasks is in this milestone.' : 'No tasks yet. Add one and assign it to someone on the project.'} />
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Task</TableCell>
                    {user.role !== 'employee' && <TableCell>Assignee</TableCell>}
                    <TableCell>Status</TableCell>
                    <TableCell>Hours</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ms.tasks.map((t) => (
                    <TableRow key={t.id} hover sx={{ cursor: 'pointer' }} onClick={() => onOpenTask(t.id)}>
                      <TableCell>
                        <Typography sx={{ fontFamily: monoFont, fontSize: 10, color: '#7a8c7e' }}>{t.code}</Typography>
                        <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#294c49' }}>{t.title}</Typography>
                        <Typography color="text.secondary" component="p" sx={{ fontSize: 10 }}>
                          Due {formatDay(t.due_date)}
                        </Typography>
                      </TableCell>
                      {user.role !== 'employee' && (
                        <TableCell>
                          <PersonCell name={t.assignee_name} />
                        </TableCell>
                      )}
                      <TableCell>
                        <StatusChip status={t.display_status} map={TASK_STATUS} />
                      </TableCell>
                      <TableCell sx={{ fontFamily: monoFont, fontSize: 11, whiteSpace: 'nowrap' }}>
                        {formatHours(t.actual_hours)} / {formatHours(t.planned_hours)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {manages && ms.status !== 'completed' && (
            <Box sx={{ mt: 2.5 }}>
              <Button variant="contained" startIcon={<CheckOutlined />} disabled={busy || !ms.can_approve} onClick={() => act(() => approveMilestone(ms.id), 'Milestone approved. The next one is unlocked.')}>
                Approve milestone completion
              </Button>
              {ms.approve_blocker && (
                <Typography color="text.secondary" sx={{ fontSize: 11, mt: 1 }}>
                  {ms.approve_blocker}.
                </Typography>
              )}
            </Box>
          )}

          <Typography variant="h3" sx={{ mt: 3.5, mb: 1.5 }}>
            Milestone conversation
          </Typography>
          {ms.notes.length === 0 && (
            <Typography color="text.secondary" sx={{ fontSize: 12, mb: 1.5 }}>
              No notes yet.
            </Typography>
          )}
          {ms.notes.map((n) => (
            <Box key={n.id} sx={{ p: 1.75, bgcolor: '#edf2e8', borderRadius: '5px', mb: 1.25, fontSize: 12 }}>
              <Typography sx={{ fontSize: 11, fontWeight: 650 }}>
                {n.author_name} · <span style={{ fontWeight: 400, color: '#617578' }}>{formatWhen(n.created_at)}</span>
              </Typography>
              <Typography sx={{ fontSize: 12, mt: 0.5 }}>{n.note_text}</Typography>
            </Box>
          ))}
          {user.role !== 'admin' && (
            <Box component="form" onSubmit={postNote} sx={{ display: 'grid', gap: 1.25, mt: 1.5 }}>
              <TextField
                label={user.role === 'employee' ? 'Ask a question or report a blocker' : 'Reply to the team'}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                multiline
                minRows={2}
                required
                slotProps={{ htmlInput: { maxLength: 4000 } }}
              />
              <Button type="submit" disabled={busy || !note.trim()} sx={{ justifySelf: 'start' }}>
                Post note
              </Button>
            </Box>
          )}
        </>
      )}
    </SidePanel>
  );
}

/** Manager plans a task for someone on the project (prototype "Assign employee" drawer). */
function TaskForm({ milestone, onSaved, onCancel }) {
  const [values, setValues] = useState({ title: '', description: '', predicted_hours: '', due_date: '', assigned_to: milestone.assignable[0]?.id ?? '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (field) => (event) => setValues((v) => ({ ...v, [field]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const saved = await createTask(milestone.id, {
        title: values.title,
        description: values.description || null,
        predicted_hours: Number(values.predicted_hours || 0),
        due_date: values.due_date || null,
        assigned_to: Number(values.assigned_to),
      });
      onSaved(saved);
    } catch (err) {
      setErrors(err.fields ?? { form: err.message });
    } finally {
      setSaving(false);
    }
  }

  if (milestone.assignable.length === 0) {
    return (
      <Box sx={{ mb: 2, p: 1.75, bgcolor: '#faf0d9', color: '#88601c', borderRadius: '5px', fontSize: 12 }}>
        Nobody can be assigned yet: attach one of your teams to this project first (My team).
        <Button size="small" onClick={onCancel} sx={{ ml: 1 }}>
          Close
        </Button>
      </Box>
    );
  }

  return (
    <Box component="form" onSubmit={submit} sx={{ display: 'grid', gap: 1.75, mb: 2.5, p: 2, bgcolor: '#f3f6ed', borderRadius: '5px' }}>
      <TextField label="Task title" value={values.title} onChange={set('title')} required error={!!errors.title} helperText={errors.title} />
      <TextField label="What done looks like" value={values.description} onChange={set('description')} multiline minRows={2} />
      <TextField select label="Assign to" value={values.assigned_to} onChange={set('assigned_to')} required error={!!errors.assigned_to} helperText={errors.assigned_to ?? 'Only people on a team attached to this project.'}>
        {milestone.assignable.map((p) => (
          <MenuItem key={p.id} value={p.id}>
            {p.name}
            {p.job_title ? ` · ${p.job_title}` : ''}
          </MenuItem>
        ))}
      </TextField>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.75 }}>
        <TextField label="Planned hours" type="number" value={values.predicted_hours} onChange={set('predicted_hours')} slotProps={{ htmlInput: { min: 0, step: 0.5 } }} error={!!errors.predicted_hours} helperText={errors.predicted_hours} />
        <TextField
          label="Due date"
          type="date"
          value={values.due_date}
          onChange={set('due_date')}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: milestone.due_from, max: milestone.due_until } }}
          error={!!errors.due_date}
          helperText={errors.due_date ?? `${formatDate(milestone.due_from)} to ${formatDate(milestone.due_until)}`}
        />
      </Box>
      {errors.form && (
        <Typography variant="caption" color="error">
          {errors.form}
        </Typography>
      )}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button type="submit" variant="contained" size="small" disabled={saving}>
          {saving ? 'Saving…' : 'Create task'}
        </Button>
        <Button type="button" size="small" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </Box>
    </Box>
  );
}

function Detail({ label, value }) {
  return (
    <Box>
      <Typography component="p" color="text.secondary" sx={{ fontSize: 10, mb: 0.625 }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 12 }}>{value}</Typography>
    </Box>
  );
}

Detail.propTypes = { label: PropTypes.string.isRequired, value: PropTypes.string.isRequired };

TaskForm.propTypes = {
  milestone: PropTypes.shape({
    id: PropTypes.number.isRequired,
    due_from: PropTypes.string.isRequired,
    due_until: PropTypes.string.isRequired,
    assignable: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.number, name: PropTypes.string, job_title: PropTypes.string })).isRequired,
  }).isRequired,
  onSaved: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};

MilestonePanel.propTypes = {
  milestoneId: PropTypes.number,
  onClose: PropTypes.func.isRequired,
  onOpenTask: PropTypes.func.isRequired,
};
