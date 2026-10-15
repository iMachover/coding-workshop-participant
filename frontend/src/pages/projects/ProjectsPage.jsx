import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import AddOutlined from '@mui/icons-material/AddOutlined';
import ArrowForwardOutlined from '@mui/icons-material/ArrowForwardOutlined';
import { useAuth } from '../../context/useAuth';
import { useApiGet } from '../../hooks/useApiGet';
import { usePanelParams } from '../../hooks/usePanelParams';
import { HEALTH, NO_TEAM } from '../../config/statuses';
import { ROLE_LABELS } from '../../config/navigation';
import { EmptyState } from '../../components/EmptyState';
import { HighlightBanner } from '../../components/HighlightBanner';
import { LoadState } from '../../components/LoadState';
import { Meter } from '../../components/Meter';
import { SectionCard } from '../../components/SectionCard';
import { SidePanel } from '../../components/SidePanel';
import { StatusChip } from '../../components/StatusChip';
import { SearchBar } from '../../components/SearchBar';
import { PageHeader } from '../../layout/PageHeader';
import { fetchProjectOptions } from '../../services/projectsService';
import { monoFont } from '../../theme';
import { formatDate, formatHours, formatMoney } from '../../utils/format';
import { ProjectForm } from './ProjectForm';

const HEALTH_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'on_track', label: 'On track' },
  { value: 'at_risk', label: 'At risk' },
];

// Employees only see projects they joined through a team, so "No team" is for admin and manager.
const TEAM_FILTERS = [{ value: 'no_team', label: 'No team' }];

const matchesFilter = (p, filter) =>
  filter === 'all' || (filter === 'no_team' ? p.team_names.length === 0 : p.health === filter);

/**
 * Projects page for every role (prototype `RolePage page="Projects"`): register banner,
 * searchable table, and a side panel per project. Admin creates and archives, manager
 * edits dates and budget of own projects, employee sees only joined projects and own figures.
 * `?selected=<id>` opens a project's panel, so other pages can link straight to it;
 * `?create=1` opens the admin's create panel.
 */
export function ProjectsPage() {
  const { user } = useAuth();
  const { open } = usePanelParams();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [options, setOptions] = useState(null);
  const { data: projects, error, retry } = useApiGet('/projects');
  const isAdmin = user.role === 'admin';
  const mine = user.role === 'employee';
  // `?create=1` opens the create panel, so the Overview's Create project button lands here open.
  const creating = isAdmin && params.get('create') === '1';
  const setCreating = (on) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (on) next.set('create', '1');
        else next.delete('create');
        return next;
      },
      { replace: !on },
    );

  useEffect(() => {
    if (isAdmin) fetchProjectOptions().then(setOptions, () => setOptions(null));
  }, [isAdmin]);

  const select = (id) => open('selected', id);

  const query = search.trim().toLowerCase();
  const visible = (projects ?? []).filter(
    (p) => matchesFilter(p, filter) && `${p.code} ${p.name} ${p.manager_name}`.toLowerCase().includes(query),
  );
  const sum = (key) => (projects ?? []).reduce((total, p) => total + (mine ? p.mine[key] : p[key]), 0);

  return (
    <>
      <PageHeader
        eyebrow={`${ROLE_LABELS[user.role]} workspace · Projects`}
        title={mine ? 'My projects' : 'Projects'}
        subtitle={mine ? 'Only the projects you are assigned to, with your own hours and cost.' : 'Ownership, progress, hours and cost for every project you can see.'}
        actions={
          isAdmin && (
            <Button variant="contained" startIcon={<AddOutlined />} onClick={() => setCreating(true)}>
              New project
            </Button>
          )
        }
      />
      {!projects && <LoadState error={error} onRetry={retry} />}
      {projects && (
        <>
          <HighlightBanner
            eyebrow={isAdmin ? 'Portfolio register' : 'Assigned project register'}
            title={`${projects.length} active ${projects.length === 1 ? 'project' : 'projects'}`}
            subtitle="One accountable manager per project. Dependencies keep milestones in sequence."
            figures={
              mine
                ? [
                    { label: 'Your planned hours', value: formatHours(sum('planned_hours')) },
                    { label: 'Your actual hours', value: formatHours(sum('actual_hours')) },
                    { label: 'Your actual cost', value: formatMoney(sum('actual_cost')) },
                  ]
                : [
                    { label: 'Actual / planned hours', value: `${formatHours(sum('actual_hours'))} / ${formatHours(sum('planned_hours'))}` },
                    { label: 'Actual cost / total budget', value: `${formatMoney(sum('actual_cost'))} / ${formatMoney(sum('budget'))}` },
                    { label: 'Needing attention', value: String(projects.filter((p) => p.health === 'at_risk').length) },
                    { label: 'Without a team', value: String(projects.filter((p) => p.team_names.length === 0).length) },
                  ]
            }
          />
          <SectionCard
            title={mine ? 'My assigned projects' : 'Active projects'}
            count={visible.length}
            subtitle="Select a project for milestones, ownership, and details."
            action={
              <SearchBar
                search={search}
                onSearch={setSearch}
                placeholder="Search projects…"
                filter={filter}
                onFilter={setFilter}
                filterLabel="Filter projects"
                filterOptions={mine ? HEALTH_FILTERS : [...HEALTH_FILTERS, ...TEAM_FILTERS]}
              />
            }
            footer="Project dates and costs are estimates. Completion requires manager approval of all milestones."
          >
            {visible.length === 0 ? (
              <EmptyState text={projects.length ? 'No projects match these filters. Try another search or reset the filter.' : mine ? 'You are not on a project yet. Your manager assigns you through a team.' : 'No active projects.'} />
            ) : (
              <ProjectTable projects={visible} mine={mine} onOpen={select} />
            )}
          </SectionCard>
        </>
      )}

      <SidePanel open={creating} title="Create a project" onClose={() => setCreating(false)}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          One manager owns the project. Team and employee assignments are made by that manager.
        </Typography>
        <ProjectForm
          options={options}
          onSaved={(saved) => {
            setCreating(false);
            retry();
            select(saved.id);
          }}
          onCancel={() => setCreating(false)}
        />
      </SidePanel>
    </>
  );
}

/** The teams on a project, or an amber badge when none is assigned yet. */
export function TeamLine({ teamNames }) {
  if (teamNames.length === 0) {
    return (
      <Box sx={{ mt: 0.625 }}>
        <StatusChip status="none" map={NO_TEAM} />
      </Box>
    );
  }
  return (
    <Typography color="text.secondary" component="p" sx={{ fontSize: 10, mt: 0.25 }}>
      {teamNames.length === 1 ? 'Team' : 'Teams'}: {teamNames.join(', ')}
    </Typography>
  );
}

TeamLine.propTypes = { teamNames: PropTypes.arrayOf(PropTypes.string).isRequired };

function ProjectTable({ projects, mine, onOpen }) {
  return (
    <TableContainer>
      <Table size="small" sx={{ minWidth: 820 }}>
        <TableHead>
          <TableRow>
            <TableCell>Project / owner</TableCell>
            <TableCell>Health</TableCell>
            <TableCell sx={{ width: 150 }}>Delivery progress</TableCell>
            <TableCell>{mine ? 'Your hours' : 'Actual / planned hours'}</TableCell>
            <TableCell>{mine ? 'Your cost' : 'Cost / budget'}</TableCell>
            <TableCell>Target end</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {projects.map((p) => (
            <TableRow key={p.id} hover sx={{ cursor: 'pointer' }} onClick={() => onOpen(p.id)}>
              <TableCell>
                <Typography sx={{ fontFamily: monoFont, fontSize: 10, color: '#7a8c7e', mb: 0.25 }}>{p.code}</Typography>
                <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#294c49' }}>{p.name}</Typography>
                <Typography color="text.secondary" component="p" sx={{ fontSize: 10, mt: 0.25 }}>
                  {p.manager_name} · {p.department}
                </Typography>
                <TeamLine teamNames={p.team_names} />
              </TableCell>
              <TableCell>
                <StatusChip status={p.status === 'closed' ? 'closed' : p.health} map={{ ...HEALTH, closed: { label: 'Closed', tone: 'muted' } }} />
              </TableCell>
              <TableCell>
                <Meter percent={p.progress.percent} warn={p.health === 'at_risk'} label={`${p.progress.percent}% complete`} />
              </TableCell>
              <TableCell sx={{ fontFamily: monoFont, fontSize: 11, whiteSpace: 'nowrap' }}>
                {mine ? `${formatHours(p.mine.actual_hours)} / ${formatHours(p.mine.planned_hours)}` : `${formatHours(p.actual_hours)} / ${formatHours(p.planned_hours)}`}
              </TableCell>
              <TableCell sx={{ fontFamily: monoFont, fontSize: 11, whiteSpace: 'nowrap' }}>
                {mine ? `${formatMoney(p.mine.actual_cost)} / ${formatMoney(p.mine.planned_cost)}` : `${formatMoney(p.actual_cost)} / ${formatMoney(p.budget)}`}
              </TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(p.end_date)}</TableCell>
              <TableCell align="right">
                <Button variant="text" size="small" endIcon={<ArrowForwardOutlined />} onClick={(event) => { event.stopPropagation(); onOpen(p.id); }}>
                  Open
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

const figuresShape = { planned_hours: PropTypes.number, actual_hours: PropTypes.number, planned_cost: PropTypes.number, actual_cost: PropTypes.number };

ProjectTable.propTypes = {
  projects: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.number.isRequired,
      code: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      department: PropTypes.string,
      manager_name: PropTypes.string,
      health: PropTypes.string.isRequired,
      status: PropTypes.string,
      progress: PropTypes.shape({ percent: PropTypes.number }).isRequired,
      end_date: PropTypes.string,
      budget: PropTypes.number,
      team_names: PropTypes.arrayOf(PropTypes.string).isRequired,
      ...figuresShape,
      mine: PropTypes.shape(figuresShape),
    }),
  ).isRequired,
  mine: PropTypes.bool.isRequired,
  onOpen: PropTypes.func.isRequired,
};
