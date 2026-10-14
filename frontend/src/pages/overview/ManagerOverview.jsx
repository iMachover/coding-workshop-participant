import PropTypes from 'prop-types';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined';
import ArrowForwardOutlined from '@mui/icons-material/ArrowForwardOutlined';
import PersonAddOutlined from '@mui/icons-material/PersonAddOutlined';
import CheckOutlined from '@mui/icons-material/CheckOutlined';
import LayersOutlined from '@mui/icons-material/LayersOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import PaidOutlined from '@mui/icons-material/PaidOutlined';
import { useAuth } from '../../context/useAuth';
import { useApiGet } from '../../hooks/useApiGet';
import { usePanelParams } from '../../hooks/usePanelParams';
import { HEALTH, MILESTONE_STATUS, NO_TEAM, TASK_STATUS } from '../../config/statuses';
import { EmptyState } from '../../components/EmptyState';
import { FigureRow } from '../../components/FigureRow';
import { HighlightBanner } from '../../components/HighlightBanner';
import { LoadState } from '../../components/LoadState';
import { Meter } from '../../components/Meter';
import { PersonCell } from '../../components/PersonCell';
import { SectionCard } from '../../components/SectionCard';
import { StatCards } from '../../components/StatCards';
import { StatusChip } from '../../components/StatusChip';
import { PageHeader } from '../../layout/PageHeader';
import { monoFont } from '../../theme';
import {
  formatCount,
  formatDate,
  formatDay,
  formatHours,
  formatMoney,
  formatWhen,
} from '../../utils/format';

/**
 * Manager Overview (MANAGER.md §6.1): stat cards, project in focus, milestone sequence,
 * review queue, people's weekly capacity, budget. Data: GET /manager/overview?project_id.
 * Assign employee, Review submission and Edit dates & budget arrive with their own slices.
 */
export function ManagerOverview() {
  const { user } = useAuth();
  const { open } = usePanelParams();
  const [projectId, setProjectId] = useState(null);
  const path = projectId ? `/manager/overview?project_id=${projectId}` : '/manager/overview';
  const { data, error, retry } = useApiGet(path);
  // "Assign employee" plans a task in the milestone that is currently open for work.
  const planning = data?.focus?.milestones.find((m) => !m.locked && m.status !== 'completed');

  const selector = data?.projects.length > 1 && (
    <TextField
      select
      size="small"
      label="Project in focus"
      value={data.focus?.id ?? ''}
      onChange={(event) => setProjectId(event.target.value)}
      sx={{ minWidth: 260 }}
    >
      {data.projects.map((project) => (
        <MenuItem key={project.id} value={project.id}>
          {project.code} · {project.name}
        </MenuItem>
      ))}
    </TextField>
  );

  return (
    <>
      <PageHeader
        eyebrow={`Delivery overview · ${user.first_name} ${user.last_name}`}
        title="Overview"
        subtitle="Your projects, approvals and team capacity this week."
        actions={
          <>
            {selector}
            {planning && (
              <Button variant="contained" startIcon={<PersonAddOutlined />} onClick={() => open('milestone', planning.id)}>
                Assign employee
              </Button>
            )}
          </>
        }
      />
      {data && error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error.message}
        </Alert>
      )}
      {data ? <Content data={data} /> : <LoadState error={error} onRetry={retry} />}
    </>
  );
}

function Content({ data }) {
  const { stats, focus, review_queue: queue, people, week } = data;

  return (
    <>
      <StatCards
        items={[
          {
            label: 'Your active projects',
            value: formatCount(stats.active_projects),
            detail: `${stats.on_track} on track · ${stats.at_risk} at risk`,
            icon: LayersOutlined,
          },
          {
            label: 'Budget remaining',
            value: focus ? formatMoney(focus.remaining_budget) : '—',
            detail: focus ? `${formatMoney(focus.actual_cost)} actual of ${formatMoney(focus.budget)}` : 'No project',
            icon: PaidOutlined,
          },
          {
            label: 'Project hours',
            value: focus ? formatHours(focus.actual_hours) : '—',
            detail: focus ? `${formatHours(focus.planned_hours)} planned · ${focus.hours_used_percent}% used` : 'No project',
            icon: AccessTimeOutlined,
          },
          {
            label: 'Pending approvals',
            value: formatCount(stats.pending_approvals),
            detail: queue.length ? `${queue[0].employee_name}'s task is ready to review` : 'Nothing waiting for you',
            icon: CheckOutlined,
          },
        ]}
      />

      {focus ? (
        <HighlightBanner
          eyebrow={`${focus.code} · Project in focus`}
          title={focus.name}
          subtitle={focus.description}
          meta={
            <>
              <StatusChip inverse status={focus.health} map={HEALTH} />
              {focus.team_names.length === 0 && <StatusChip status="none" map={NO_TEAM} />}
              <Typography variant="body2">
                Target {formatDate(focus.end_date)} · {focus.manager_name}
                {focus.team_names.length > 0 && ` · ${focus.team_names.join(', ')}`}
              </Typography>
            </>
          }
          progress={{
            label: `${focus.progress.percent}% delivery complete`,
            valueLabel: `${focus.progress.completed} / ${focus.progress.total} tasks completed`,
            percent: focus.progress.percent,
          }}
          figures={[
            { label: 'Actual / planned cost', value: `${formatMoney(focus.actual_cost)} / ${formatMoney(focus.planned_cost)}` },
            { label: 'Actual / planned hours', value: `${formatHours(focus.actual_hours)} / ${formatHours(focus.planned_hours)}` },
            { label: 'Budget', value: formatMoney(focus.budget) },
          ]}
          aside={
            <Button
              variant="text"
              size="small"
              component={RouterLink}
              to={`/projects?selected=${focus.id}`}
              endIcon={<ArrowForwardOutlined />}
              sx={{ color: '#dce8bf', justifySelf: 'start', px: 0 }}
            >
              Open project
            </Button>
          }
        />
      ) : (
        <Paper variant="outlined" sx={{ p: 2.5, mb: 2 }}>
          <Typography sx={{ fontWeight: 600 }}>No active projects</Typography>
          <Typography variant="body2" color="text.secondary">
            An admin assigns projects to managers. Yours will show here.
          </Typography>
        </Paper>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 324px' },
          gap: { xs: 2, lg: 2.5 },
          alignItems: 'start',
        }}
      >
        <Box sx={{ display: 'grid', gap: { xs: 2, lg: 2.5 }, minWidth: 0 }}>
          {focus && (
            <SectionCard
              title="Milestone sequence"
              subtitle="Each milestone starts only when the one before it is approved."
              footer="The next milestone unlocks only after you approve the current one."
            >
              <MilestoneSequence milestones={focus.milestones} />
            </SectionCard>
          )}
          <SectionCard
            title="People & weekly capacity"
            count={people.length}
            subtitle={`Week of ${formatDay(week.start)} · your direct reports · ${formatHours(week.capacity_hours)} capacity`}
          >
            <PeopleList people={people} capacity={week.capacity_hours} />
          </SectionCard>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr' }, gap: { xs: 2, lg: 2.5 } }}>
          <SectionCard title="Ready for review" count={queue.length} footer="Completion always requires your approval.">
            <ReviewQueue queue={queue} />
          </SectionCard>
          {focus && (
            <SectionCard title="Budget pulse">
              <Box sx={{ px: 2.25, py: 2 }}>
                <Meter
                  percent={focus.budget_used_percent}
                  warn={focus.budget_used_percent > 100}
                  label="Used to date"
                  valueLabel={`${focus.budget_used_percent}%`}
                />
              </Box>
              <Divider />
              <FigureRow label="Planned cost" value={formatMoney(focus.planned_cost)} />
              <Divider />
              <FigureRow label="Actual cost" value={formatMoney(focus.actual_cost)} />
              <Divider />
              <FigureRow label="Remaining" value={formatMoney(focus.remaining_budget)} />
            </SectionCard>
          )}
        </Box>
      </Box>
    </>
  );
}

function MilestoneSequence({ milestones }) {
  const { open } = usePanelParams();
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: `repeat(${Math.min(milestones.length, 3)}, 1fr)` } }}>
      {milestones.map((m) => {
        const state = m.locked ? 'locked' : m.status;
        const date =
          m.status === 'completed'
            ? `Approved ${formatDay(m.completed_at?.slice(0, 10))}`
            : `${m.status === 'in_progress' ? 'Due' : 'Target'} ${formatDay(m.projected_end_date)}`;
        return (
          <Box
            key={m.id}
            role="button"
            tabIndex={0}
            aria-label={`Open milestone ${m.name}`}
            onClick={() => open('milestone', m.id)}
            onKeyDown={(event) => event.key === 'Enter' && open('milestone', m.id)}
            sx={{ px: 2.1, py: 2, minWidth: 0, cursor: 'pointer', boxShadow: (theme) => `-1px -1px 0 ${theme.palette.divider}`, '&:hover': { bgcolor: '#f0f4e9' } }}
          >
            <MilestoneMarker state={state} sequence={m.sequence} />
            <Typography sx={{ fontSize: 12, fontWeight: 650, mt: 1.25, mb: 0.625 }}>{m.name}</Typography>
            <Typography color="text.secondary" component="p" sx={{ fontSize: 10, mb: 1 }}>
              {m.progress.completed} of {m.progress.total} tasks completed
            </Typography>
            <StatusChip status={state} map={MILESTONE_STATUS} />
            <Typography color="text.secondary" component="p" sx={{ fontSize: 10, mt: 1.25 }}>
              {date}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

/** Round marker: a tick when done, the number when active, a lock when waiting. */
function MilestoneMarker({ state, sequence }) {
  const active = state === 'in_progress';
  return (
    <Box
      aria-hidden="true"
      sx={{
        width: 25,
        height: 25,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        bgcolor: active ? '#24595a' : '#e6eddf',
        color: active ? '#e9f0db' : '#527152',
        fontFamily: monoFont,
        fontSize: 10,
      }}
    >
      {state === 'completed' && <CheckOutlined sx={{ fontSize: 12 }} />}
      {state === 'locked' && <LockOutlined sx={{ fontSize: 11 }} />}
      {(active || state === 'not_started') && String(sequence).padStart(2, '0')}
    </Box>
  );
}

function PeopleList({ people, capacity }) {
  if (!people.length) {
    return <EmptyState text="No direct reports yet. People you manage appear here with their weekly hours." />;
  }
  return people.map((person, index) => {
    const free = capacity - person.hours_this_week;
    return (
      <Box
        key={person.id}
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1.3fr 1fr 64px', md: '1.2fr 1fr 75px' },
          alignItems: 'center',
          gap: { xs: 1.25, md: 2.5 },
          px: { xs: 1.625, lg: 2 },
          py: { xs: 1.625, lg: 1.125 },
          borderTop: index ? 1 : 0,
          borderColor: '#e8ede5',
        }}
      >
        <PersonCell name={person.name} sub={[person.team_names, person.job_title].filter(Boolean).join(' · ')} />
        <Box>
          <Meter
            percent={(person.hours_this_week / capacity) * 100}
            warn={person.over_capacity}
            label={`${formatHours(person.hours_this_week)} / ${formatHours(capacity)}`}
            valueLabel={person.over_capacity ? `${formatHours(-free)} over` : `${formatHours(free)} free`}
          />
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Typography sx={{ fontFamily: monoFont, fontSize: 11, fontWeight: 600 }}>{person.progress.percent}%</Typography>
          <Typography color="text.secondary" component="p" sx={{ fontSize: 10 }}>
            task progress
          </Typography>
        </Box>
      </Box>
    );
  });
}

function ReviewQueue({ queue }) {
  const { open } = usePanelParams();
  if (!queue.length) {
    return <EmptyState text="Nothing to review. Submitted tasks appear here until you approve or reopen them." />;
  }
  return queue.map((item, index) => (
    <Box key={item.id} sx={{ px: 2, py: 1.75, borderTop: index ? 1 : 0, borderColor: 'divider' }}>
      <PersonCell name={item.employee_name} sub={`Submitted · ${item.submitted_at ? formatWhen(item.submitted_at) : '—'}`} />
      <Typography sx={{ fontSize: 12, fontWeight: 650, mt: 1.125, mb: 0.625 }}>{item.title}</Typography>
      <Typography color="text.secondary" component="p" sx={{ fontSize: 10 }}>
        {item.code} · {item.project_code} · {item.milestone_name}
      </Typography>
      <Typography color="text.secondary" component="p" sx={{ fontFamily: monoFont, fontSize: 10, mb: 1.5 }}>
        {formatHours(item.actual_hours)} actual / {formatHours(item.planned_hours)} planned · {formatMoney(item.actual_cost)}
      </Typography>
      <StatusChip status="submitted" map={TASK_STATUS} />
      <Box sx={{ mt: 1.5 }}>
        <Button variant="contained" size="small" endIcon={<ArrowForwardOutlined />} onClick={() => open('task', item.id)}>
          Review submission
        </Button>
      </Box>
    </Box>
  ));
}

const progressShape = PropTypes.shape({ completed: PropTypes.number, total: PropTypes.number, percent: PropTypes.number });

const milestoneShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  sequence: PropTypes.number.isRequired,
  name: PropTypes.string.isRequired,
  status: PropTypes.string.isRequired,
  locked: PropTypes.bool.isRequired,
  projected_end_date: PropTypes.string,
  completed_at: PropTypes.string,
  progress: progressShape.isRequired,
});

const personShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  name: PropTypes.string.isRequired,
  job_title: PropTypes.string,
  team_names: PropTypes.string,
  hours_this_week: PropTypes.number.isRequired,
  over_capacity: PropTypes.bool.isRequired,
  progress: progressShape.isRequired,
});

const reviewShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  code: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  employee_name: PropTypes.string.isRequired,
  project_code: PropTypes.string,
  milestone_name: PropTypes.string,
  submitted_at: PropTypes.string,
  actual_hours: PropTypes.number,
  planned_hours: PropTypes.number,
  actual_cost: PropTypes.number,
});

Content.propTypes = {
  data: PropTypes.shape({
    week: PropTypes.shape({ start: PropTypes.string, capacity_hours: PropTypes.number }).isRequired,
    stats: PropTypes.shape({
      active_projects: PropTypes.number,
      on_track: PropTypes.number,
      at_risk: PropTypes.number,
      pending_approvals: PropTypes.number,
    }).isRequired,
    focus: PropTypes.shape({
      id: PropTypes.number,
      name: PropTypes.string,
      team_names: PropTypes.arrayOf(PropTypes.string),
      milestones: PropTypes.arrayOf(milestoneShape),
    }),
    review_queue: PropTypes.arrayOf(reviewShape).isRequired,
    people: PropTypes.arrayOf(personShape).isRequired,
  }).isRequired,
};

MilestoneSequence.propTypes = { milestones: PropTypes.arrayOf(milestoneShape).isRequired };

MilestoneMarker.propTypes = {
  state: PropTypes.oneOf(['completed', 'in_progress', 'not_started', 'locked']).isRequired,
  sequence: PropTypes.number.isRequired,
};

PeopleList.propTypes = {
  people: PropTypes.arrayOf(personShape).isRequired,
  capacity: PropTypes.number.isRequired,
};

ReviewQueue.propTypes = { queue: PropTypes.arrayOf(reviewShape).isRequired };
