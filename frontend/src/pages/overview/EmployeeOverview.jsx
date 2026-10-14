import PropTypes from 'prop-types';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined';
import ChecklistOutlined from '@mui/icons-material/ChecklistOutlined';
import FolderOutlined from '@mui/icons-material/FolderOutlined';
import PaidOutlined from '@mui/icons-material/PaidOutlined';
import { useApiGet } from '../../hooks/useApiGet';
import { usePanelParams } from '../../hooks/usePanelParams';
import { HEALTH, TASK_STATUS } from '../../config/statuses';
import { FigureRow } from '../../components/FigureRow';
import { HighlightBanner } from '../../components/HighlightBanner';
import { EmptyState } from '../../components/EmptyState';
import { LoadState } from '../../components/LoadState';
import { Meter } from '../../components/Meter';
import { SectionCard } from '../../components/SectionCard';
import { StatCards } from '../../components/StatCards';
import { StatusChip } from '../../components/StatusChip';
import { PageHeader } from '../../layout/PageHeader';
import { monoFont } from '../../theme';
import { daysUntil, formatCount, formatDay, formatHours, formatMoney, formatToday } from '../../utils/format';

/**
 * Employee Overview (EMPLOYEE.md §6.2): stat cards, active milestone, open tasks, hours.
 * Data: GET /me/overview. Log hours arrives with the My hours slice.
 */
export function EmployeeOverview() {
  const { data, error, retry } = useApiGet('/me/overview');

  return (
    <>
      <PageHeader
        eyebrow={`My workspace · ${formatToday()}`}
        title="Overview"
        subtitle="Your projects, tasks and hours this week."
      />
      {data ? <Content data={data} /> : <LoadState error={error} onRetry={retry} />}
    </>
  );
}

function Content({ data }) {
  const { stats, week, active_milestone: milestone, tasks, snapshot } = data;
  const manager = stats.managers[0] ?? 'Your manager';

  return (
    <>
      <StatCards
        items={[
          {
            label: 'Assigned projects',
            value: formatCount(stats.project_count),
            detail: stats.project_count ? `${stats.departments.join(' + ')} · ${stats.managers.join(', ')}` : 'Not on a project yet',
            icon: FolderOutlined,
          },
          {
            label: 'Your hours this week',
            value: formatHours(stats.hours_this_week),
            detail: `of ${formatHours(week.capacity_hours)} capacity`,
            icon: AccessTimeOutlined,
          },
          {
            label: 'Your cost this week',
            value: formatMoney(stats.cost_this_week),
            detail: `${formatMoney(stats.hourly_rate)} / h rate`,
            icon: PaidOutlined,
          },
          {
            label: 'Your task completion',
            value: `${formatCount(stats.tasks.completed)} / ${formatCount(stats.tasks.total)}`,
            detail: `${stats.tasks.completed} completed · ${stats.tasks_submitted} awaiting review`,
            icon: ChecklistOutlined,
          },
        ]}
      />

      {milestone ? (
        <HighlightBanner
          eyebrow={`Your active milestone · ${milestone.project_code}`}
          title={milestone.name}
          subtitle={[milestone.project_name, milestone.team_names, `Managed by ${milestone.manager_name}`]
            .filter(Boolean)
            .join(' · ')}
          meta={
            <>
              <StatusChip inverse status={milestone.health} map={HEALTH} />
              <Typography variant="body2">
                Milestone due {formatDay(milestone.due_date)}
                {milestone.next_task_due && ` · Your next task due ${formatDay(milestone.next_task_due)}`}
              </Typography>
            </>
          }
          progress={{
            label: 'Team milestone progress',
            valueLabel: `${milestone.progress.completed} / ${milestone.progress.total} tasks completed · ${milestone.progress.percent}%`,
            percent: milestone.progress.percent,
          }}
          figures={[
            {
              label: 'Your actual / planned hours',
              value: `${formatHours(milestone.my_actual_hours)} / ${formatHours(milestone.my_planned_hours)}`,
            },
            {
              label: 'Your actual / planned cost',
              value: `${formatMoney(milestone.my_actual_cost)} / ${formatMoney(milestone.my_planned_cost)}`,
            },
            {
              label: 'Next milestone',
              value: milestone.next_milestone ? `${milestone.next_milestone.name} · locked` : 'None',
            },
          ]}
        />
      ) : (
        <Paper variant="outlined" sx={{ p: 2.5, mb: 2 }}>
          <Typography sx={{ fontWeight: 600 }}>No active milestone</Typography>
          <Typography variant="body2" color="text.secondary">
            None of your tasks is in progress. Your assigned work is listed below.
          </Typography>
        </Paper>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 310px' },
          gap: { xs: 2, lg: 2.5 },
          alignItems: 'start',
        }}
      >
        <SectionCard
          title="Your assigned work"
          count={tasks.length}
          subtitle="Open tasks, in the order you can work on them. Select one to start or submit it."
          footer={`Submitted is not completed. ${manager} reviews and approves your work.`}
        >
          <TaskTable tasks={tasks} />
        </SectionCard>

        <SectionCard title="Your hours">
          <Box sx={{ px: 2.25, py: 2 }}>
            <Meter
              percent={(snapshot.hours_this_week / week.capacity_hours) * 100}
              label="Logged this week"
              valueLabel={`${formatHours(snapshot.hours_this_week)} / ${formatHours(week.capacity_hours)}`}
            />
            <Typography color="text.secondary" component="p" sx={{ mt: 1, fontSize: 10 }}>
              Week of {formatDay(week.start)}. Hours you log, not a running timer.
            </Typography>
          </Box>
          <Divider />
          <FigureRow label="Available this week" value={formatHours(snapshot.available_hours)} />
          <Divider />
          <FigureRow label="Lifetime logged hours" value={formatHours(snapshot.lifetime_hours)} />
          <Divider />
          <FigureRow label="Lifetime logged cost" value={formatMoney(snapshot.lifetime_cost)} />
        </SectionCard>
      </Box>
    </>
  );
}

function TaskTable({ tasks }) {
  const { open } = usePanelParams();
  if (!tasks.length) {
    return <EmptyState text="No open tasks. Your submitted work will appear here when it is ready for review." />;
  }
  return (
    <TableContainer>
      <Table size="small" sx={{ minWidth: 640 }}>
        <TableHead>
          <TableRow>
            <TableCell>Task / project</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Actual / plan</TableCell>
            <TableCell>Due</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {tasks.map((task) => (
            <TableRow key={task.id} hover sx={{ cursor: 'pointer' }} onClick={() => open('task', task.id)}>
              <TableCell>
                <Typography sx={{ fontFamily: monoFont, fontSize: 10, color: '#7a8c7e', mb: 0.25 }}>
                  {task.code} · {task.milestone_name}
                </Typography>
                <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#294c49' }}>{task.title}</Typography>
                <Link
                  component={RouterLink}
                  to={`/projects?selected=${task.project_id}`}
                  underline="hover"
                  onClick={(event) => event.stopPropagation()}
                  sx={{ display: 'block', fontSize: 10, mt: 0.25, color: 'text.secondary' }}
                >
                  {task.project_name}
                </Link>
              </TableCell>
              <TableCell>
                <StatusChip status={task.display_status} map={TASK_STATUS} />
              </TableCell>
              <TableCell sx={{ fontFamily: monoFont, fontSize: 11, whiteSpace: 'nowrap' }}>
                {formatHours(task.actual_hours)} / {formatHours(task.planned_hours)}
                <Box sx={{ color: 'text.secondary', fontSize: 10, mt: 0.25 }}>
                  {formatMoney(task.actual_cost)} / {formatMoney(task.planned_cost)}
                </Box>
              </TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                <DueDate task={task} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/** Due date, flagged amber when work in progress is due within a week. */
function DueDate({ task }) {
  if (!task.due_date) return '—';
  const days = daysUntil(task.due_date);
  const soon = task.status === 'in_progress' && days <= 7;
  return (
    <Box sx={{ color: soon ? '#8c6727' : 'text.primary' }}>
      <Typography sx={{ fontSize: 12 }}>{formatDay(task.due_date)}</Typography>
      {soon && (
        <Typography component="p" sx={{ fontSize: 10, mt: 0.25 }}>
          {days < 0 ? `${-days} days overdue` : days === 0 ? 'Today' : `In ${days} days`}
        </Typography>
      )}
    </Box>
  );
}

const progressShape = PropTypes.shape({ completed: PropTypes.number, total: PropTypes.number, percent: PropTypes.number });

const taskShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  code: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  project_id: PropTypes.number,
  project_name: PropTypes.string,
  milestone_name: PropTypes.string,
  status: PropTypes.string.isRequired,
  display_status: PropTypes.string.isRequired,
  due_date: PropTypes.string,
  actual_hours: PropTypes.number,
  planned_hours: PropTypes.number,
  actual_cost: PropTypes.number,
  planned_cost: PropTypes.number,
});

Content.propTypes = {
  data: PropTypes.shape({
    week: PropTypes.shape({ start: PropTypes.string, capacity_hours: PropTypes.number }).isRequired,
    stats: PropTypes.shape({
      project_count: PropTypes.number,
      departments: PropTypes.arrayOf(PropTypes.string),
      managers: PropTypes.arrayOf(PropTypes.string),
      hours_this_week: PropTypes.number,
      cost_this_week: PropTypes.number,
      hourly_rate: PropTypes.number,
      tasks: progressShape,
      tasks_submitted: PropTypes.number,
    }).isRequired,
    active_milestone: PropTypes.shape({ name: PropTypes.string, progress: progressShape }),
    tasks: PropTypes.arrayOf(taskShape).isRequired,
    snapshot: PropTypes.shape({
      hours_this_week: PropTypes.number,
      available_hours: PropTypes.number,
      lifetime_hours: PropTypes.number,
      lifetime_cost: PropTypes.number,
    }).isRequired,
  }).isRequired,
};

TaskTable.propTypes = { tasks: PropTypes.arrayOf(taskShape).isRequired };

DueDate.propTypes = { task: taskShape.isRequired };
