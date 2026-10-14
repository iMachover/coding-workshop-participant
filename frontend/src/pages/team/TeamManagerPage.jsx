import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import AddOutlined from '@mui/icons-material/AddOutlined';
import GroupAddOutlined from '@mui/icons-material/GroupAddOutlined';
import { useAuth } from '../../context/useAuth';
import { useApiGet } from '../../hooks/useApiGet';
import { usePanelParams } from '../../hooks/usePanelParams';
import { useRefresh } from '../../context/useRefresh';
import { EmptyState } from '../../components/EmptyState';
import { FigureRow } from '../../components/FigureRow';
import { LoadState } from '../../components/LoadState';
import { Meter } from '../../components/Meter';
import { PersonCell } from '../../components/PersonCell';
import { SectionCard } from '../../components/SectionCard';
import { StatusChip } from '../../components/StatusChip';
import { SearchBar } from '../../components/SearchBar';
import { NO_TEAM } from '../../config/statuses';
import { PageHeader } from '../../layout/PageHeader';
import { fetchTeamOptions } from '../../services/peopleService';
import { monoFont } from '../../theme';
import { formatHours } from '../../utils/format';
import { TeamPanel } from './TeamPanel';

const CAPACITY = 40;

const CAPACITY_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'over', label: 'Over capacity' },
  { value: 'free', label: 'Has free hours' },
];

/**
 * My team (MANAGER.md §6.3, prototype `RolePage page="Team"`): the direct reports table with
 * weekly allocation and task progress, hours per team, and the Teams section where the
 * manager creates teams, adds or removes members and attaches teams to projects. The
 * manager picks people from the full employee list (Assign employee); an unassigned employee
 * becomes a direct report when picked, and the profile panel releases them again.
 * `?person=<id>` opens a direct report's profile panel.
 */
export function TeamManagerPage() {
  const { user } = useAuth();
  const { open } = usePanelParams();
  const { version } = useRefresh();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [teamSearch, setTeamSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [panel, setPanel] = useState({ mode: null, teamId: null });
  const [options, setOptions] = useState(null);
  const { data: people, error, retry } = useApiGet('/employees');
  const { data: teams } = useApiGet('/teams');

  useEffect(() => {
    fetchTeamOptions().then(setOptions, () => setOptions(null));
  }, [version]);

  const query = search.trim().toLowerCase();
  const visible = (people ?? []).filter(
    (p) =>
      (filter === 'all' || (filter === 'over' ? p.over_capacity : p.hours_this_week < CAPACITY)) &&
      `${p.name} ${p.email} ${p.team_names.join(' ')}`.toLowerCase().includes(query),
  );
  const unassigned = (teams ?? []).filter((t) => t.projects.length === 0);
  // Filter teams by project: every team, the ones without a project, or the ones on one project.
  const projectOptions = [
    { value: 'all', label: 'All teams' },
    { value: 'none', label: 'Not on a project' },
    ...uniqueProjects(teams ?? []).map((p) => ({ value: `project:${p.id}`, label: `${p.code} ${p.name}` })),
  ];
  const teamQuery = teamSearch.trim().toLowerCase();
  const visibleTeams = (teams ?? []).filter(
    (t) =>
      (teamFilter === 'all' || (teamFilter === 'none' ? t.projects.length === 0 : t.projects.some((p) => `project:${p.id}` === teamFilter))) &&
      [t.code, t.name, ...t.members.map((m) => m.name), ...t.projects.flatMap((p) => [p.code, p.name])].join(' ').toLowerCase().includes(teamQuery),
  );
  const current = (teams ?? []).find((t) => t.id === panel.teamId) ?? null;

  return (
    <>
      <PageHeader
        eyebrow={`Manager workspace · ${user.first_name} ${user.last_name}`}
        title="My team"
        subtitle="Your direct reports, their weekly hours and progress, and the teams you run."
        actions={
          <>
            <Button startIcon={<AddOutlined />} onClick={() => setPanel({ mode: 'create', teamId: null })}>
              Create team
            </Button>
            <Button variant="contained" startIcon={<GroupAddOutlined />} onClick={() => setPanel({ mode: 'assign', teamId: null })} disabled={!options}>
              Assign employee
            </Button>
          </>
        }
      />
      {!people && <LoadState error={error} onRetry={retry} />}
      {people && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 300px' }, gap: { xs: 2, lg: 2.5 }, alignItems: 'start' }}>
          <Box sx={{ display: 'grid', gap: { xs: 2, lg: 2.5 }, minWidth: 0 }}>
            <SectionCard
              title="Direct reports"
              count={visible.length}
              subtitle={`${people.length} people · ${formatHours(CAPACITY)} weekly capacity baseline`}
              action={<SearchBar search={search} onSearch={setSearch} placeholder="Search people…" filter={filter} onFilter={setFilter} filterLabel="Filter by capacity" filterOptions={CAPACITY_FILTERS} />}
              footer="Open a profile to edit a direct report's name and email, or to release them so another manager can take them on. Role, rate and permissions stay with administrators."
            >
              {visible.length === 0 ? (
                <EmptyState text={people.length ? 'No matching people. Try a different name or filter.' : 'No direct reports yet. Use Assign employee to pick people from the employee list.'} />
              ) : (
                <PeopleTable people={visible} onOpen={(id) => open('person', id)} />
              )}
            </SectionCard>

            <SectionCard
              title="Teams"
              count={teams ? visibleTeams.length : undefined}
              subtitle="Members are your direct reports. A team's members can be given tasks on the projects it is attached to."
              action={<SearchBar search={teamSearch} onSearch={setTeamSearch} placeholder="Search teams…" filter={teamFilter} onFilter={setTeamFilter} filterLabel="Filter by project" filterOptions={projectOptions} />}
            >
              {!teams && <LoadState onRetry={retry} />}
              {teams && teams.length === 0 && <EmptyState text="No teams yet. Create one from the employee list and attach it to a project." />}
              {teams && teams.length > 0 && visibleTeams.length === 0 && <EmptyState text="No teams match these filters. Try another search or reset the project filter." />}
              {visibleTeams.map((t, index) => (
                <Box key={t.id} sx={{ px: 2, py: 1.75, borderTop: index ? 1 : 0, borderColor: 'divider', display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) auto' }, gap: 1.5, alignItems: 'center' }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontFamily: monoFont, fontSize: 10, color: '#7a8c7e' }}>{t.code}</Typography>
                    <Typography sx={{ fontSize: 12, fontWeight: 650 }}>{t.name}</Typography>
                    <Typography color="text.secondary" sx={{ fontSize: 10, mt: 0.375 }}>
                      {t.members.length ? t.members.map((m) => m.name).join(', ') : 'No members yet'} · {formatHours(t.hours_this_week)} this week
                    </Typography>
                    <Box sx={{ mt: 0.75 }}>
                      {t.projects.length ? (
                        <Typography color="text.secondary" sx={{ fontSize: 10 }}>
                          {t.projects.length === 1 ? 'Project' : 'Projects'}: {t.projects.map((p) => `${p.code} ${p.name}`).join(', ')}
                        </Typography>
                      ) : (
                        <StatusChip status="none" map={{ none: { label: 'Not on a project', tone: 'warning' } }} />
                      )}
                    </Box>
                  </Box>
                  <Button size="small" onClick={() => setPanel({ mode: 'manage', teamId: t.id })}>
                    Manage team
                  </Button>
                </Box>
              ))}
            </SectionCard>
          </Box>

          <Box sx={{ display: 'grid', gap: { xs: 2, lg: 2.5 } }}>
            <SectionCard title="Hours per team" subtitle="Logged this week by each team's members.">
              {teams?.length === 0 && <EmptyState text="No teams yet." />}
              {teams?.map((t, index) => (
                <Box key={t.id}>
                  {index > 0 && <Divider />}
                  <FigureRow label={t.name} value={`${formatHours(t.hours_this_week)} / ${formatHours(t.members.length * CAPACITY)}`} />
                </Box>
              ))}
            </SectionCard>
            {unassigned.length > 0 && (
              <SectionCard title="Needs a project">
                <Box sx={{ px: 2, py: 1.75 }}>
                  <StatusChip status="none" map={NO_TEAM} />
                  <Typography color="text.secondary" sx={{ fontSize: 11, mt: 1 }}>
                    {unassigned.map((t) => t.name).join(', ')} {unassigned.length === 1 ? 'is' : 'are'} not attached to a project, so their members cannot be given tasks. Open the team to attach one.
                  </Typography>
                </Box>
              </SectionCard>
            )}
          </Box>
        </Box>
      )}

      <TeamPanel mode={panel.mode} team={current} teams={teams ?? []} options={options} onClose={() => setPanel({ mode: null, teamId: null })} />
    </>
  );
}

/** The distinct projects across the manager's teams, in code order, for the project filter. */
function uniqueProjects(teams) {
  const byId = new Map();
  teams.forEach((t) => t.projects.forEach((p) => byId.set(p.id, p)));
  return [...byId.values()].sort((a, b) => a.code.localeCompare(b.code));
}

function PeopleTable({ people, onOpen }) {
  return (
    <TableContainer>
      <Table size="small" sx={{ minWidth: 720 }}>
        <TableHead>
          <TableRow>
            <TableCell>Person</TableCell>
            <TableCell>Role / team</TableCell>
            <TableCell sx={{ width: 170 }}>Weekly allocation</TableCell>
            <TableCell>Task progress</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {people.map((p) => {
            const free = CAPACITY - p.hours_this_week;
            return (
              <TableRow key={p.id} hover sx={{ cursor: 'pointer' }} onClick={() => onOpen(p.id)}>
                <TableCell>
                  <PersonCell name={p.name} sub={p.email} />
                </TableCell>
                <TableCell>
                  <Typography sx={{ fontSize: 12 }}>{p.job_title ?? 'Employee'}</Typography>
                  <Typography color="text.secondary" component="p" sx={{ fontSize: 10, mt: 0.25 }}>
                    {p.team_names.length ? p.team_names.join(', ') : 'Not on a team'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Meter
                    percent={(p.hours_this_week / CAPACITY) * 100}
                    warn={p.over_capacity}
                    label={`${formatHours(p.hours_this_week)} / ${formatHours(CAPACITY)}`}
                    valueLabel={p.over_capacity ? `${formatHours(-free)} over` : `${formatHours(free)} free`}
                  />
                </TableCell>
                <TableCell>
                  <Typography sx={{ fontFamily: monoFont, fontSize: 11, fontWeight: 600 }}>{p.tasks.percent}%</Typography>
                  <Typography color="text.secondary" component="p" sx={{ fontSize: 10 }}>
                    {p.tasks.completed} / {p.tasks.total} approved
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Button variant="text" size="small" onClick={(event) => { event.stopPropagation(); onOpen(p.id); }}>
                    View profile
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

PeopleTable.propTypes = {
  people: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.number.isRequired,
      name: PropTypes.string.isRequired,
      email: PropTypes.string,
      job_title: PropTypes.string,
      team_names: PropTypes.arrayOf(PropTypes.string).isRequired,
      hours_this_week: PropTypes.number.isRequired,
      over_capacity: PropTypes.bool,
      tasks: PropTypes.shape({ completed: PropTypes.number, total: PropTypes.number, percent: PropTypes.number }).isRequired,
    }),
  ).isRequired,
  onOpen: PropTypes.func.isRequired,
};
