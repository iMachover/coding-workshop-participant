import PropTypes from 'prop-types';
import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useAuth } from '../../context/useAuth';
import { useToast } from '../../context/useToast';
import { useApiGet } from '../../hooks/useApiGet';
import { HEALTH, MILESTONE_STATUS, NO_TEAM } from '../../config/statuses';
import { LoadState } from '../../components/LoadState';
import { Meter } from '../../components/Meter';
import { SidePanel } from '../../components/SidePanel';
import { StatusChip } from '../../components/StatusChip';
import { archiveProject } from '../../services/projectsService';
import { monoFont } from '../../theme';
import { formatDate, formatDay, formatHours, formatMoney } from '../../utils/format';
import { ProjectForm } from './ProjectForm';

/**
 * Side panel for one project (prototype project drawer): figures, the milestone
 * dependency chain, edit (admin / manager) and archive (admin).
 * Notes and task approval arrive with the tasks slice.
 *
 * @param {{ projectId: number|null, options?: object, onClose: () => void, onChanged: () => void }} props
 */
export function ProjectPanel({ projectId, options, onClose, onChanged }) {
  const { user } = useAuth();
  const showToast = useToast();
  const [mode, setMode] = useState('view'); // view | edit | archive
  const [busy, setBusy] = useState(false);
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
            <StatusChip status={project.is_archived ? 'archived' : project.health} map={{ ...HEALTH, archived: { label: 'Archived', tone: 'muted' } }} />
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
                ? 'No team is working on this project yet. Assign one of your teams from My team so tasks can be planned.'
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
              No milestones yet. {user.role === 'manager' ? 'Add the first milestone from the project workflow slice.' : 'The manager adds them in order.'}
            </Typography>
          )}
          {project.milestones.map((m) => {
            const state = m.locked ? 'locked' : m.status;
            return (
              <Box key={m.id} sx={{ p: 1.875, bgcolor: '#edf2e8', borderRadius: '5px', mb: 1.5, fontSize: 12 }}>
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
  options: PropTypes.object,
  onClose: PropTypes.func.isRequired,
  onChanged: PropTypes.func.isRequired,
};
