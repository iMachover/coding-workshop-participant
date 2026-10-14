import PropTypes from 'prop-types';
import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined';
import AddOutlined from '@mui/icons-material/AddOutlined';
import PersonAddOutlined from '@mui/icons-material/PersonAddOutlined';
import ArrowForwardOutlined from '@mui/icons-material/ArrowForwardOutlined';
import FolderOutlined from '@mui/icons-material/FolderOutlined';
import GroupOutlined from '@mui/icons-material/GroupOutlined';
import PaidOutlined from '@mui/icons-material/PaidOutlined';
import { useApiGet } from '../../hooks/useApiGet';
import { AUDIT_ACTION, HEALTH } from '../../config/statuses';
import { EmptyState } from '../../components/EmptyState';
import { LoadState } from '../../components/LoadState';
import { Meter } from '../../components/Meter';
import { PersonCell } from '../../components/PersonCell';
import { SectionCard } from '../../components/SectionCard';
import { StatCards } from '../../components/StatCards';
import { StatusChip } from '../../components/StatusChip';
import { SearchBar } from '../../components/SearchBar';
import { PageHeader } from '../../layout/PageHeader';
import { monoFont } from '../../theme';
import { formatCount, formatDate, formatHours, formatMoney, formatWhen } from '../../utils/format';

/**
 * Admin Overview (ADMIN.md §6.1): portfolio totals, every active project, manager
 * coverage and the latest audit entries. Data: GET /admin/overview.
 * Create user and Create project open the People and Projects pages with their create panel;
 * the archived filter arrives with the Archives slice.
 */

const PORTFOLIO_FILTERS = [
  { value: 'active', label: 'Active projects' },
  { value: 'at_risk', label: 'Needs attention' },
];
export function AdminOverview() {
  const { data, error, retry } = useApiGet('/admin/overview');

  return (
    <>
      <PageHeader
        eyebrow="Organization overview"
        title="Overview"
        subtitle="Project health, the manager of each project, and recent changes."
        actions={
          <>
            <Button component={RouterLink} to="/people?create=1" startIcon={<PersonAddOutlined />}>
              Create user
            </Button>
            <Button variant="contained" component={RouterLink} to="/projects?create=1" startIcon={<AddOutlined />}>
              Create project
            </Button>
          </>
        }
      />
      {data ? <Content data={data} /> : <LoadState error={error} onRetry={retry} />}
    </>
  );
}

function Content({ data }) {
  const { stats, portfolio, managers, recent_audit: audit } = data;
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('active');
  const query = search.trim().toLowerCase();
  const visible = portfolio.filter(
    (project) =>
      (filter === 'active' || project.health === filter) &&
      `${project.code} ${project.name} ${project.manager_name}`.toLowerCase().includes(query),
  );

  return (
    <>
      <StatCards
        items={[
          {
            label: 'Active projects',
            value: formatCount(stats.active_projects),
            detail: `${stats.on_track} on track · ${stats.at_risk} at risk`,
            icon: FolderOutlined,
          },
          {
            label: 'Portfolio budget',
            value: formatMoney(stats.portfolio_budget),
            detail: `${formatMoney(stats.actual_cost)} actual cost to date`,
            icon: PaidOutlined,
          },
          {
            label: 'Hours invested',
            value: formatHours(stats.actual_hours),
            detail: `${formatHours(stats.planned_hours)} planned across active projects`,
            icon: AccessTimeOutlined,
          },
          {
            label: 'People',
            value: formatCount(stats.active_people),
            detail: `${stats.managers} managers`,
            icon: GroupOutlined,
          },
        ]}
      />

      <Box sx={{ mb: { xs: 2, lg: 2.5 } }}>
        <SectionCard
          title="Project portfolio"
          count={visible.length}
          subtitle="Every active project and the manager accountable for it. Select a row to open it."
          action={
            <SearchBar
              search={search}
              onSearch={setSearch}
              placeholder="Search projects…"
              filter={filter}
              onFilter={setFilter}
              filterLabel="Filter portfolio"
              filterOptions={PORTFOLIO_FILTERS}
            />
          }
          footer="Employee and team assignments are managed by each project's manager."
        >
          <PortfolioTable projects={visible} filtered={visible.length !== portfolio.length} />
        </SectionCard>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '1.05fr 1fr' },
          gap: { xs: 2, lg: 2.5 },
          alignItems: 'start',
        }}
      >
        <SectionCard title="Managers" subtitle="Active projects and budget each manager owns.">
          <ManagerTable managers={managers} />
        </SectionCard>
        <SectionCard
          title="Recent audit activity"
          subtitle="Who changed what, newest first."
          action={
            <Button variant="text" size="small" component={RouterLink} to="/audit" endIcon={<ArrowForwardOutlined />}>
              All activity
            </Button>
          }
        >
          <AuditList entries={audit} />
        </SectionCard>
      </Box>
    </>
  );
}

function PortfolioTable({ projects, filtered }) {
  const navigate = useNavigate();
  if (!projects.length) {
    return (
      <EmptyState
        text={filtered ? 'No projects match this search or filter.' : 'No active projects. Create one to start the portfolio.'}
      />
    );
  }
  return (
    <TableContainer>
      <Table size="small" sx={{ minWidth: 820 }}>
        <TableHead>
          <TableRow>
            <TableCell>Project</TableCell>
            <TableCell>Manager</TableCell>
            <TableCell>Health</TableCell>
            <TableCell sx={{ width: 160 }}>Delivery</TableCell>
            <TableCell>Actual / budget</TableCell>
            <TableCell>Deadline</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {projects.map((project) => (
            <TableRow
              key={project.id}
              hover
              sx={{ cursor: 'pointer' }}
              onClick={() => navigate(`/projects?selected=${project.id}`)}
            >
              <TableCell>
                <Typography sx={{ fontFamily: monoFont, fontSize: 10, color: '#7a8c7e', mb: 0.25 }}>{project.code}</Typography>
                <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#294c49' }}>{project.name}</Typography>
                <Typography color="text.secondary" component="p" sx={{ fontSize: 10, mt: 0.25 }}>
                  {project.department}
                </Typography>
              </TableCell>
              <TableCell>
                <PersonCell name={project.manager_name} />
              </TableCell>
              <TableCell>
                <StatusChip status={project.health} map={HEALTH} />
              </TableCell>
              <TableCell>
                <Meter
                  percent={project.progress.percent}
                  warn={project.health === 'at_risk'}
                  label={`${project.progress.percent}%`}
                />
              </TableCell>
              <TableCell sx={{ fontFamily: monoFont, fontSize: 11, whiteSpace: 'nowrap' }}>
                {formatMoney(project.actual_cost)}
                <Box sx={{ color: 'text.secondary', fontSize: 10, mt: 0.25 }}>of {formatMoney(project.budget)}</Box>
              </TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(project.end_date)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function ManagerTable({ managers }) {
  if (!managers.length) {
    return <EmptyState text="No managers yet. Create a manager account to assign projects." />;
  }
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Manager</TableCell>
            <TableCell>Active projects</TableCell>
            <TableCell align="right">Budget owned</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {managers.map((manager) => (
            <TableRow key={manager.id}>
              <TableCell>
                <PersonCell name={manager.name} />
              </TableCell>
              <TableCell>
                {manager.active_projects} {manager.active_projects === 1 ? 'project' : 'projects'}
              </TableCell>
              <TableCell align="right" sx={{ fontFamily: monoFont, fontSize: 11 }}>
                {formatMoney(manager.budget_owned)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function AuditList({ entries }) {
  if (!entries.length) {
    return <EmptyState text="No activity recorded yet. Every change made in the workspace will appear here." />;
  }
  return (
    <Box sx={{ px: 2 }}>
      {entries.map((entry, index) => (
        <Box
          key={entry.id}
          sx={{
            display: 'flex',
            gap: 1.375,
            py: { xs: 1.375, lg: 1.125 },
            borderTop: index ? 1 : 0,
            borderColor: '#e8ede5',
            fontSize: 11,
          }}
        >
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 650 }}>{entry.summary}</Typography>
            <Typography color="text.secondary" component="p" sx={{ fontSize: 10, mt: 0.375 }}>
              {[entry.actor_name, AUDIT_ACTION[entry.action] ?? entry.action, entry.entity_code].filter(Boolean).join(' · ')}
            </Typography>
          </Box>
          <Typography component="time" color="text.secondary" sx={{ fontSize: 10, whiteSpace: 'nowrap' }}>
            {formatWhen(entry.created_at)}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

const progressShape = PropTypes.shape({ completed: PropTypes.number, total: PropTypes.number, percent: PropTypes.number });

const projectShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  code: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  department: PropTypes.string,
  manager_name: PropTypes.string.isRequired,
  health: PropTypes.string.isRequired,
  progress: progressShape.isRequired,
  actual_cost: PropTypes.number,
  budget: PropTypes.number,
  end_date: PropTypes.string,
});

const managerShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  name: PropTypes.string.isRequired,
  active_projects: PropTypes.number.isRequired,
  budget_owned: PropTypes.number,
});

const auditShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  created_at: PropTypes.string.isRequired,
  actor_name: PropTypes.string,
  action: PropTypes.string.isRequired,
  entity_code: PropTypes.string,
  summary: PropTypes.string.isRequired,
});

Content.propTypes = {
  data: PropTypes.shape({
    stats: PropTypes.shape({
      active_projects: PropTypes.number,
      on_track: PropTypes.number,
      at_risk: PropTypes.number,
      portfolio_budget: PropTypes.number,
      actual_cost: PropTypes.number,
      actual_hours: PropTypes.number,
      planned_hours: PropTypes.number,
      active_people: PropTypes.number,
      managers: PropTypes.number,
    }).isRequired,
    portfolio: PropTypes.arrayOf(projectShape).isRequired,
    managers: PropTypes.arrayOf(managerShape).isRequired,
    recent_audit: PropTypes.arrayOf(auditShape).isRequired,
  }).isRequired,
};

PortfolioTable.propTypes = {
  projects: PropTypes.arrayOf(projectShape).isRequired,
  filtered: PropTypes.bool.isRequired,
};

ManagerTable.propTypes = { managers: PropTypes.arrayOf(managerShape).isRequired };

AuditList.propTypes = { entries: PropTypes.arrayOf(auditShape).isRequired };
