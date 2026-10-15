import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddOutlined from '@mui/icons-material/AddOutlined';
import { useAuth } from '../../context/useAuth';
import { useRefresh } from '../../context/useRefresh';
import { useToast } from '../../context/useToast';
import { useApiGet } from '../../hooks/useApiGet';
import { HEALTH, MILESTONE_STATUS, NO_TEAM } from '../../config/statuses';
import { LoadState } from '../../components/LoadState';
import { Meter } from '../../components/Meter';
import { SidePanel } from '../../components/SidePanel';
import { StatusChip } from '../../components/StatusChip';
import { archiveProject, fetchProjectOptions } from '../../services/projectsService';
import { closeProject, createMilestone } from '../../services/workService';
import { monoFont } from '../../theme';
import { formatDate, formatDay, formatHours, formatMoney } from '../../utils/format';
import { ProjectForm } from './ProjectForm';

/**
 * Side panel for one project (prototype project drawer): figures, the milestone
 * dependency chain, edit (admin / manager) and archive (admin).
 * Notes and task approval arrive with the tasks slice.
 *
 * @param {{ projectId: number|null, onClose: () => void, onOpenMilestone: (id: number) => void }} props
 */
export function ProjectPanel({ projectId, onClose, onOpenMilestone }) {
  const { user } = useAuth();
  const { bump } = useRefresh();
  const showToast = useToast();
  const [mode, setMode] = useState('view'); // view | edit | archive | milestone | close
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState(null);
  const onChanged = bump;

  useEffect(() => {
    if (user.role === 'admin' && projectId) fetchProjectOptions().then(setOptions, () => setOptions(null));
  }, [user.role, projectId]);
  const { data, error, loading, retry } = useApiGet(projectId ? `/projects/${projectId}` : null);
  // While a different project loads, show the skeleton rather than the previous project's data.
  const project = loading ? null : data;
  const mine = user.role === 'employee';

  function close() {
    setMode('view');
    onClose();
  }

  async function archive() {
    setBusy(true);
    try {
      await archiveProject(project.id);
      showToast(`Project ${project.code} archived. Restore it from Archives.`);
      onChanged();
      close();
    } catch (err) {
      showToast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function close_() {
    setBusy(true);
    try {
      await closeProject(project.id);
      showToast(`Project ${project.code} closed`);
      onChanged();
      setMode('view');
    } catch (err) {
      showToast(err.message);
    } finally {
      setBusy(false);
    }
  }

  const manages = user.role === 'manager' && project?.manager_id === user.id && project?.status === 'active' && !project?.is_archived;
  const allApproved = project?.milestones.length > 0 && project.milestones.every((m) => m.status === 'completed');
  const title = mode === 'edit' ? (user.role === 'admin' ? 'Edit project & manager' : 'Edit dates & budget') : (project?.name ?? 'Project');

  return (
    <SidePanel open={projectId !== null} title={title} onClose={close}>
      {!project && <LoadState error={error} onRetry={retry} />}
      {project && mode === 'edit' && (
        <ProjectForm
          project={project}
          options={options}
          onSaved={() => {
            setMode('view');
            retry();
            onChanged();
          }}
          onCancel={() => setMode('view')}
        />
      )}
      {project && mode !== 'edit' && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
            <StatusChip
              status={project.is_archived ? 'archived' : project.status === 'closed' ? 'closed' : project.health}
              map={{ ...HEALTH, archived: { label: 'Archived', tone: 'muted' }, closed: { label: 'Closed', tone: 'muted' } }}
            />
            <Typography sx={{ fontFamily: monoFont, fontSize: 11, color: 'text.secondary' }}>{project.code}</Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
              {project.department} · {project.manager_name}
            </Typography>
          </Box>
          {project.description && (
            <Typography sx={{ mt: 1.5, fontSize: 12 }} color="text.secondary">
              {project.description}
            </Typography>
          )}

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2.25, my: 3 }}>
            <Detail label="Planned start" value={formatDate(project.start_date)} />
            <Detail label="Predicted end" value={formatDate(project.end_date)} />
            <Detail
              label={mine ? 'Your actual / planned hours' : 'Actual / planned hours'}
              value={mine ? `${formatHours(project.mine.actual_hours)} / ${formatHours(project.mine.planned_hours)}` : `${formatHours(project.actual_hours)} / ${formatHours(project.planned_hours)}`}
            />
            <Detail
              label={mine ? 'Your actual / planned cost' : 'Actual cost / budget'}
              value={mine ? `${formatMoney(project.mine.actual_cost)} / ${formatMoney(project.mine.planned_cost)}` : `${formatMoney(project.actual_cost)} / ${formatMoney(project.budget)}`}
            />
            <Detail label="Delivery" value={`${project.progress.percent}% · ${project.progress.completed} / ${project.progress.total} tasks`} />
            <Box>
              <Typography component="p" color="text.secondary" sx={{ fontSize: 10, mb: 0.625 }}>
                Teams
              </Typography>
              {project.team_names.length ? (
                <Typography sx={{ fontSize: 12 }}>{project.team_names.join(', ')}</Typography>
              ) : (
                <StatusChip status="none" map={NO_TEAM} />
              )}
            </Box>
          </Box>
          {project.team_names.length === 0 && !project.is_archived && (
            <Box sx={{ mb: 2.5, p: 1.75, bgcolor: '#faf0d9', color: '#88601c', borderRadius: '5px', fontSize: 12 }}>
              {user.role === 'manager'
                ? (
                  <>
                    No team is working on this project yet. Attach one of your teams so tasks can be planned.{' '}
                    <Link component={RouterLink} to="/team" sx={{ color: 'inherit', fontWeight: 600 }}>
                      Open My team
                    </Link>
                  </>
                )
                : user.role === 'admin'
                  ? `No team is assigned yet. ${project.manager_name} assigns teams from the My team page.`
                  : 'No team has been assigned to this project yet.'}
            </Box>
          )}

          {!mine && !project.is_archived && (
            <Button onClick={() => setMode('edit')}>{user.role === 'admin' ? 'Edit project & manager' : 'Edit dates & budget'}</Button>
          )}

          <Typography variant="h3" sx={{ mt: 3, mb: 1.5 }}>
            Milestone dependency chain
          </Typography>
          {project.milestones.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No milestones yet. {user.role === 'manager' ? 'Add the first one below; each milestone depends on the one before it.' : 'The manager adds them in order.'}
            </Typography>
          )}
          {project.milestones.map((m) => {
            const state = m.locked ? 'locked' : m.status;
            return (
              <Box
                key={m.id}
                role="button"
                tabIndex={0}
                aria-label={`Open milestone ${m.name}`}
                onClick={() => onOpenMilestone(m.id)}
                onKeyDown={(event) => event.key === 'Enter' && onOpenMilestone(m.id)}
                sx={{ p: 1.875, bgcolor: '#edf2e8', borderRadius: '5px', mb: 1.5, fontSize: 12, cursor: 'pointer', '&:hover': { bgcolor: '#e3ebdd' } }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 650 }}>
                    {String(m.sequence).padStart(2, '0')} · {m.name}
                  </Typography>
                  <StatusChip status={state} map={MILESTONE_STATUS} />
                </Box>
                <Typography color="text.secondary" sx={{ fontSize: 11, my: 1 }}>
                  {m.status === 'completed' ? `Approved ${formatDay(m.completed_at?.slice(0, 10))}` : `Due ${formatDay(m.projected_end_date)}`} · {m.progress.completed} / {m.progress.total} tasks
                </Typography>
                <Meter percent={m.progress.percent} />
              </Box>
            );
          })}

          {manages && mode === 'view' && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
              <Button size="small" startIcon={<AddOutlined />} onClick={() => setMode('milestone')}>
                Add dependent milestone
              </Button>
              {allApproved && (
                <Button size="small" variant="contained" onClick={() => setMode('close')}>
                  Close project
                </Button>
              )}
            </Box>
          )}
          {mode === 'milestone' && (
            <MilestoneForm
              project={project}
              onSaved={(saved) => {
                setMode('view');
                showToast(`Milestone ${String(saved.sequence).padStart(2, '0')} added`);
                onChanged();
              }}
              onCancel={() => setMode('view')}
            />
          )}
          {mode === 'close' && (
            <Box sx={{ mt: 2, p: 2, bgcolor: '#eff3e5', borderRadius: '5px' }}>
              <Typography sx={{ fontSize: 12, mb: 1.5 }}>
                Close {project.name}? Every milestone is approved. A closed project keeps its history and leaves the active lists.
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button variant="contained" size="small" onClick={close_} disabled={busy}>
                  Confirm close
                </Button>
                <Button size="small" onClick={() => setMode('view')} disabled={busy}>
                  Cancel
                </Button>
              </Box>
            </Box>
          )}
          {user.role === 'admin' && !project.is_archived && mode === 'view' && (
            <Box sx={{ display: 'flex', gap: 1, mt: 3.25, pt: 2.25, borderTop: 1, borderColor: 'divider' }}>
              <Button color="error" onClick={() => setMode('archive')}>
                Archive project
              </Button>
            </Box>
          )}
          {mode === 'archive' && (
            <Box sx={{ mt: 3, p: 2, bgcolor: '#eff3e5', borderRadius: '5px' }}>
              <Typography sx={{ fontSize: 12, mb: 1.5 }}>
                Archive {project.name}? It leaves every list but keeps its history, and you can restore it from Archives.
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button color="error" variant="contained" size="small" onClick={archive} disabled={busy}>
                  Confirm archive
                </Button>
                <Button size="small" onClick={() => setMode('view')} disabled={busy}>
                  Cancel
                </Button>
              </Box>
            </Box>
          )}
        </>
      )}
    </SidePanel>
  );
}

/** Manager appends the next milestone (prototype "New milestone" form). */
function MilestoneForm({ project, onSaved, onCancel }) {
  const last = project.milestones.at(-1);
  const [values, setValues] = useState({ name: '', description: '', start_date: '', projected_end_date: '', predicted_hours: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (field) => (event) => setValues((v) => ({ ...v, [field]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const saved = await createMilestone(project.id, {
        name: values.name,
        description: values.description || null,
        start_date: values.start_date || null,
        projected_end_date: values.projected_end_date || null,
        predicted_hours: Number(values.predicted_hours || 0),
      });
      onSaved(saved);
    } catch (err) {
      setErrors(err.fields ?? { form: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box component="form" onSubmit={submit} sx={{ display: 'grid', gap: 1.75, mt: 2, p: 2, bgcolor: '#f3f6ed', borderRadius: '5px' }}>
      <TextField label="Milestone name" value={values.name} onChange={set('name')} required error={!!errors.name} helperText={errors.name} />
      <TextField label="Description" value={values.description} onChange={set('description')} multiline minRows={2} />
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.75 }}>
        <TextField label="Start date" type="date" value={values.start_date} onChange={set('start_date')} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: project.start_date, max: values.projected_end_date || project.end_date } }} error={!!errors.start_date} helperText={errors.start_date} />
        <TextField label="Predicted end date" type="date" value={values.projected_end_date} onChange={set('projected_end_date')} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: values.start_date || project.start_date, max: project.end_date } }} error={!!errors.projected_end_date} helperText={errors.projected_end_date} />
      </Box>
      <TextField label="Planned hours" type="number" value={values.predicted_hours} onChange={set('predicted_hours')} slotProps={{ htmlInput: { min: 0, step: 1 } }} error={!!errors.predicted_hours} helperText={errors.predicted_hours} />
      <Typography color="text.secondary" sx={{ fontSize: 11 }}>
        {last ? `Depends on ${String(last.sequence).padStart(2, '0')} · ${last.name}. It stays locked until that one is approved.` : 'This becomes the first milestone of the project.'}
      </Typography>
      <Typography color="text.secondary" sx={{ fontSize: 11 }}>
        Dates must fall between {formatDate(project.start_date)} and {formatDate(project.end_date)} and must not overlap another milestone.
      </Typography>
      {errors.form && (
        <Typography variant="caption" color="error">
          {errors.form}
        </Typography>
      )}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button type="submit" variant="contained" size="small" disabled={saving}>
          {saving ? 'Saving…' : 'Add milestone'}
        </Button>
        <Button type="button" size="small" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </Box>
    </Box>
  );
}

MilestoneForm.propTypes = {
  project: PropTypes.shape({
    id: PropTypes.number.isRequired,
    start_date: PropTypes.string.isRequired,
    end_date: PropTypes.string.isRequired,
    milestones: PropTypes.arrayOf(PropTypes.shape({ sequence: PropTypes.number, name: PropTypes.string })).isRequired,
  }).isRequired,
  onSaved: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};

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

ProjectPanel.propTypes = {
  projectId: PropTypes.number,
  onClose: PropTypes.func.isRequired,
  onOpenMilestone: PropTypes.func.isRequired,
};
