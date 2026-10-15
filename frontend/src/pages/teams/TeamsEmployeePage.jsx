import PropTypes from 'prop-types';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import ArrowForwardOutlined from '@mui/icons-material/ArrowForwardOutlined';
import { useAuth } from '../../context/useAuth';
import { useApiGet } from '../../hooks/useApiGet';
import { usePanelParams } from '../../hooks/usePanelParams';
import { HEALTH, MILESTONE_STATUS } from '../../config/statuses';
import { EmptyState } from '../../components/EmptyState';
import { LoadState } from '../../components/LoadState';
import { Meter } from '../../components/Meter';
import { PersonCell } from '../../components/PersonCell';
import { SectionCard } from '../../components/SectionCard';
import { StatusChip } from '../../components/StatusChip';
import { SearchBar } from '../../components/SearchBar';
import { PageHeader } from '../../layout/PageHeader';
import { monoFont } from '../../theme';
import { myTeamShape } from './shapes';
import { TeamDetailPanel } from './TeamDetailPanel';

const TEAM_STATE = {
  active: { label: 'Your active team', tone: 'info' },
  queued: { label: 'Next assignment queued', tone: 'muted' },
  idle: { label: 'No work in progress', tone: 'neutral' },
};

const STATE_FILTERS = [
  { value: 'all', label: 'All teams' },
  { value: 'active', label: 'Active' },
  { value: 'queued', label: 'Queued' },
  { value: 'idle', label: 'No work in progress' },
];

const HEALTH_FILTERS = [
  { value: 'all', label: 'Any health' },
  { value: 'on_track', label: 'On track' },
  { value: 'at_risk', label: 'At risk' },
];

/**
 * Which of the employee's teams holds their active milestone; the others are queued behind it
 * (if they have a milestone to work through) or idle.
 */
function teamState(team, hasActive) {
  if (team.projects.some((p) => p.is_active)) return 'active';
  return hasActive && team.projects.some((p) => p.milestone) ? 'queued' : 'idle';
}

/** The employee's own task progress added up across the team's projects. */
function myProgress(team) {
  const completed = team.projects.reduce((sum, p) => sum + p.my_progress.completed, 0);
  const total = team.projects.reduce((sum, p) => sum + p.my_progress.total, 0);
  return { completed, total, percent: total ? Math.round((completed / total) * 100) : 0 };
}

/**
 * My teams (EMPLOYEE.md §6.4, prototype `RolePage page="Teams"`): one row per team with its
 * state, projects and current milestones, the employee's own progress and the head count,
 * searchable and filtered by state and project health. `?team=<id>` opens the team panel with
 * the manager, milestone detail and who is on the team (teammates' progress, never their
 * cost). Side card: the employee's manager. Data: GET /me/teams.
 */
export function TeamsEmployeePage() {
  const { user } = useAuth();
  const { ids, open, close } = usePanelParams();
  const [search, setSearch] = useState('');
  const [state, setState] = useState('all');
  const [health, setHealth] = useState('all');
  const { data, error, retry } = useApiGet('/me/teams');
  // Without work in progress there is no active milestone, so nothing is "queued" behind it.
  const hasActive = data?.active_milestone_id !== null && data?.active_milestone_id !== undefined;

  const query = search.trim().toLowerCase();
  const teams = (data?.teams ?? []).map((team) => ({ ...team, state: teamState(team, hasActive) }));
  const visible = teams.filter(
    (t) =>
      (state === 'all' || t.state === state) &&
      (health === 'all' || t.projects.some((p) => p.health === health)) &&
      [t.code, t.name, t.manager_name, ...t.projects.flatMap((p) => [p.code, p.name, p.milestone?.name]), ...t.members.map((m) => m.name)]
        .join(' ')
        .toLowerCase()
        .includes(query),
  );
  const selected = teams.find((t) => t.id === ids.team) ?? null;

  return (
    <>
      <PageHeader
        eyebrow={`My workspace · ${user.first_name} ${user.last_name}`}
        title="My teams"
        subtitle="The teams you are on and what each one is working through. Open a team for its people and milestone detail."
      />
      {!data && <LoadState error={error} onRetry={retry} />}
      {data && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 300px' }, gap: { xs: 2, lg: 2.5 }, alignItems: 'start' }}>
          <SectionCard
            title="Teams"
            count={visible.length}
            subtitle="Select a team for its manager, milestones and the people working alongside you."
            action={
              <SearchBar
                search={search}
                onSearch={setSearch}
                placeholder="Search teams…"
                filters={[
                  { value: state, onChange: setState, label: 'Filter by state', options: STATE_FILTERS },
                  { value: health, onChange: setHealth, label: 'Filter by project health', options: HEALTH_FILTERS },
                ]}
              />
            }
            footer="Only your own hours and cost are shown anywhere. Teammates appear with their task progress for coordination."
          >
            {visible.length === 0 ? (
              <EmptyState text={teams.length ? 'No teams match these filters. Try another search or reset the filters.' : 'You are not on a team yet. Your manager adds you to one; projects and tasks follow from that.'} />
            ) : (
              <TeamTable teams={visible} onOpen={(id) => open('team', id)} />
            )}
          </SectionCard>
          <ManagerCard manager={data.manager} />
        </Box>
      )}

      <TeamDetailPanel team={selected} hasActive={hasActive} onClose={() => close('team')} onOpenProject={(id) => open('selected', id)} />
    </>
  );
}

function TeamTable({ teams, onOpen }) {
  return (
    <TableContainer>
      <Table size="small" sx={{ minWidth: 680 }}>
        <TableHead>
          <TableRow>
            <TableCell sx={{ minWidth: 150 }}>Team</TableCell>
            <TableCell>State</TableCell>
            <TableCell>Project · current milestone</TableCell>
            <TableCell sx={{ width: 130 }}>Your progress</TableCell>
            <TableCell>People</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {teams.map((t) => {
            const mine = myProgress(t);
            return (
              <TableRow key={t.id} hover sx={{ cursor: 'pointer' }} onClick={() => onOpen(t.id)}>
                <TableCell>
                  <Typography sx={{ fontFamily: monoFont, fontSize: 10, color: '#7a8c7e', mb: 0.25 }}>{t.code}</Typography>
                  <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#294c49' }}>{t.name}</Typography>
                  <Typography color="text.secondary" component="p" sx={{ fontSize: 10, mt: 0.25 }}>
                    Managed by {t.manager_name}
                  </Typography>
                </TableCell>
                <TableCell>
                  <StatusChip status={t.state} map={TEAM_STATE} />
                </TableCell>
                <TableCell>
                  {t.projects.length === 0 && (
                    <Typography color="text.secondary" sx={{ fontSize: 11 }}>
                      Not on a project yet
                    </Typography>
                  )}
                  {t.projects.map((p, index) => (
                    <Box key={p.id} sx={{ mt: index ? 1 : 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                        <Typography sx={{ fontFamily: monoFont, fontSize: 10, color: '#7a8c7e' }}>{p.code}</Typography>
                        <Typography sx={{ fontSize: 12 }}>{p.name}</Typography>
                        <StatusChip status={p.health} map={HEALTH} />
                      </Box>
                      <Typography color="text.secondary" component="p" sx={{ fontSize: 10, mt: 0.375 }}>
                        {p.milestone
                          ? `${String(p.milestone.sequence).padStart(2, '0')} · ${p.milestone.name} · ${p.milestone.locked ? MILESTONE_STATUS.locked.label : MILESTONE_STATUS[p.milestone.status].label} · ${p.milestone.progress.percent}%`
                          : 'All milestones approved'}
                      </Typography>
                    </Box>
                  ))}
                </TableCell>
                <TableCell>
                  <Meter percent={mine.percent} label={`${mine.completed} / ${mine.total} tasks`} valueLabel={`${mine.percent}%`} />
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  <Typography sx={{ fontFamily: monoFont, fontSize: 11, fontWeight: 600 }}>{t.members.length}</Typography>
                  <Typography color="text.secondary" component="p" sx={{ fontSize: 10 }}>
                    {t.members.length === 1 ? 'person' : 'people'}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Button variant="text" size="small" endIcon={<ArrowForwardOutlined />} onClick={(event) => { event.stopPropagation(); onOpen(t.id); }}>
                    View team
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function ManagerCard({ manager }) {
  return (
    <SectionCard title="Your manager">
      {manager ? (
        <Box sx={{ px: 2, py: 2 }}>
          <PersonCell name={manager.name} sub={manager.job_title ?? manager.email} />
          <Typography color="text.secondary" sx={{ fontSize: 11, mt: 1.5, mb: 1.5 }}>
            One manager across your teams. Talk to {manager.name.split(' ')[0]} about workload or assignment changes.
          </Typography>
          <Button size="small" component={RouterLink} to="/projects" endIcon={<ArrowForwardOutlined />}>
            My projects
          </Button>
        </Box>
      ) : (
        <EmptyState text="No manager is assigned to you yet." />
      )}
    </SectionCard>
  );
}

TeamTable.propTypes = {
  teams: PropTypes.arrayOf(myTeamShape).isRequired,
  onOpen: PropTypes.func.isRequired,
};

ManagerCard.propTypes = {
  manager: PropTypes.shape({ name: PropTypes.string, email: PropTypes.string, job_title: PropTypes.string }),
};
