import PropTypes from 'prop-types';
import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import ArrowForwardOutlined from '@mui/icons-material/ArrowForwardOutlined';
import CheckOutlined from '@mui/icons-material/CheckOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import SendOutlined from '@mui/icons-material/SendOutlined';
import { useAuth } from '../../context/useAuth';
import { useRefresh } from '../../context/useRefresh';
import { useToast } from '../../context/useToast';
import { useApiGet } from '../../hooks/useApiGet';
import { TASK_STATUS } from '../../config/statuses';
import { LoadState } from '../../components/LoadState';
import { SidePanel } from '../../components/SidePanel';
import { StatusChip } from '../../components/StatusChip';
import { completeTask, reopenTask, updateTaskStatus } from '../../services/workService';
import { monoFont } from '../../theme';
import { formatDate, formatHours, formatMoney, formatWhen } from '../../utils/format';

/**
 * One task (prototype "Your task details" / "Review completion request" drawers).
 * Employee: Start, then Submit for approval. Manager: Approve completion or Reopen.
 * The API says which actions apply (`can_start`, `can_submit`, `can_review`).
 *
 * @param {{ taskId: number|null, onClose: () => void }} props
 */
export function TaskPanel({ taskId, onClose }) {
  const { user } = useAuth();
  const { bump } = useRefresh();
  const showToast = useToast();
  const [busy, setBusy] = useState(false);
  const { data, error, loading, retry } = useApiGet(taskId ? `/tasks/${taskId}` : null);
  const task = loading ? null : data;

  async function act(fn, message) {
    setBusy(true);
    try {
      await fn();
      showToast(message);
      bump();
    } catch (err) {
      showToast(err.message);
    } finally {
      setBusy(false);
    }
  }

  const title = user.role === 'manager' && task?.status === 'submitted' ? 'Review completion request' : 'Task details';

  return (
    <SidePanel open={taskId !== null} title={title} onClose={onClose}>
      {!task && <LoadState error={error} onRetry={retry} />}
      {task && (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1.25 }}>
            <Typography sx={{ fontFamily: monoFont, fontSize: 11, color: 'text.secondary' }}>{task.code}</Typography>
            <StatusChip status={task.display_status} map={TASK_STATUS} />
          </Box>
          <Typography variant="h2" sx={{ fontSize: 21, mt: 2.5, fontFamily: '"Manrope", "DM Sans", sans-serif', letterSpacing: '-0.5px' }}>
            {task.title}
          </Typography>
          <Typography color="text.secondary" sx={{ fontSize: 12, mt: 0.5 }}>
            {task.project_code} · {task.project_name} · {task.milestone_name}
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2.25, my: 3 }}>
            <Detail label="Assigned to" value={task.assignee_name} />
            <Detail label="Manager / approver" value={task.manager_name} />
            <Detail label="Actual / planned hours" value={`${formatHours(task.actual_hours)} / ${formatHours(task.planned_hours)}`} />
            <Detail label="Actual / planned cost" value={`${formatMoney(task.actual_cost)} / ${formatMoney(task.planned_cost)}`} />
            <Detail label="Deadline" value={formatDate(task.due_date)} />
            <Detail label={task.submitted_at ? 'Submitted' : task.started_at ? 'Started' : 'Status'} value={task.submitted_at ? formatWhen(task.submitted_at) : task.started_at ? formatWhen(task.started_at) : 'Not started'} />
          </Box>

          <Typography variant="h3" sx={{ mb: 1 }}>
            What done looks like
          </Typography>
          <Typography sx={{ fontSize: 12 }} color={task.description ? 'text.primary' : 'text.secondary'}>
            {task.description || 'No description was given for this task.'}
          </Typography>

          {task.resources.length > 0 && (
            <>
              <Typography variant="h3" sx={{ mt: 2.5, mb: 1 }}>
                Resources
              </Typography>
              {task.resources.map((r) => (
                <Box key={r.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.75, borderBottom: 1, borderColor: 'divider', fontSize: 12 }}>
                  <span>
                    {r.quantity} × {r.name}
                  </span>
                  <Typography sx={{ fontFamily: monoFont, fontSize: 11 }}>
                    {r.actual_cost != null ? `${formatMoney(r.actual_cost)} actual` : `${formatMoney(r.estimated_cost)} est.`}
                  </Typography>
                </Box>
              ))}
            </>
          )}

          <Box sx={{ mt: 2.5, p: 1.75, bgcolor: '#eff3e5', color: '#4c6954', borderRadius: '5px', fontSize: 12 }}>
            {task.blocked_reason
              ? task.blocked_reason
              : task.status === 'submitted'
                ? `This request is with ${task.manager_name}. Only the manager can mark it completed.`
                : task.status === 'completed'
                  ? `Approved by ${task.manager_name}${task.completed_at ? ` · ${formatWhen(task.completed_at)}` : ''}.`
                  : task.status === 'in_progress'
                    ? 'When the work meets the description, submit it for approval. Submitting does not mark it completed.'
                    : 'Start the task when you begin the work. Your hours are logged against it.'}
          </Box>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 3.25, pt: 2.25, borderTop: 1, borderColor: 'divider' }}>
            {task.can_start && (
              <Button variant="contained" startIcon={<ArrowForwardOutlined />} disabled={busy} onClick={() => act(() => updateTaskStatus(task.id, 'in_progress'), 'Task started')}>
                Start task
              </Button>
            )}
            {task.can_submit && (
              <Button variant="contained" startIcon={<SendOutlined />} disabled={busy} onClick={() => act(() => updateTaskStatus(task.id, 'submitted'), `Submitted to ${task.manager_name} for approval`)}>
                Submit for approval
              </Button>
            )}
            {task.blocked_reason && user.role === 'employee' && (
              <Button disabled startIcon={<LockOutlined />}>
                Waiting for milestone approval
              </Button>
            )}
            {task.can_review && task.status === 'submitted' && (
              <>
                <Button variant="contained" startIcon={<CheckOutlined />} disabled={busy} onClick={() => act(() => completeTask(task.id), 'Task approved. The milestone stays open until every task is approved.')}>
                  Approve completion
                </Button>
                <Button disabled={busy} onClick={() => act(() => reopenTask(task.id), `Returned to ${task.assignee_name} for changes`)}>
                  Request changes
                </Button>
              </>
            )}
            {task.can_review && task.status === 'completed' && (
              <Button disabled={busy} onClick={() => act(() => reopenTask(task.id), 'Task reopened')}>
                Reopen task
              </Button>
            )}
          </Box>
          {task.can_review && task.status === 'submitted' && (
            <Typography color="text.secondary" sx={{ fontSize: 11, mt: 2 }}>
              Approves this task only. The next milestone stays locked until every task in the current one is approved.
            </Typography>
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

TaskPanel.propTypes = {
  taskId: PropTypes.number,
  onClose: PropTypes.func.isRequired,
};
