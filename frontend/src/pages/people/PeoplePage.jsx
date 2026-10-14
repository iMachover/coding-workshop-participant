import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import AddOutlined from '@mui/icons-material/AddOutlined';
import { useApiGet } from '../../hooks/useApiGet';
import { usePanelParams } from '../../hooks/usePanelParams';
import { ROLE } from '../../config/statuses';
import { EmptyState } from '../../components/EmptyState';
import { FigureRow } from '../../components/FigureRow';
import { LoadState } from '../../components/LoadState';
import { Meter } from '../../components/Meter';
import { PersonCell } from '../../components/PersonCell';
import { SectionCard } from '../../components/SectionCard';
import { SidePanel } from '../../components/SidePanel';
import { StatusChip } from '../../components/StatusChip';
import { SearchBar } from '../../components/SearchBar';
import { PageHeader } from '../../layout/PageHeader';
import { fetchUserOptions } from '../../services/peopleService';
import { monoFont } from '../../theme';
import { formatHours } from '../../utils/format';
import { CredentialsDialog } from './CredentialsDialog';
import { PersonForm } from './PersonForm';

const CAPACITY = 40;
const PAGE_SIZES = [10, 25, 50, 100];

const ROLE_FILTERS = [
  { value: 'all', label: 'All roles' },
  { value: 'employee', label: 'Employees' },
  { value: 'manager', label: 'Managers' },
  { value: 'admin', label: 'Admins' },
];

const STATE_FILTERS = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

/**
 * People & access (ADMIN.md §6.3, prototype `RolePage page="People"`): the paginated people
 * register with search and role / department / archived filters, a side card with counts,
 * the create-account panel and the one-time credentials dialog. `?person=<id>` opens a
 * profile; `?create=1` opens the create panel (used by the Overview's Create user button).
 */
export function PeoplePage() {
  const { open } = usePanelParams();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');
  const [department, setDepartment] = useState('all');
  const [state, setState] = useState('active');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(25);
  const [options, setOptions] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const creating = params.get('create') === '1';

  useEffect(() => {
    fetchUserOptions().then(setOptions, () => setOptions(null));
  }, []);

  // Search the server after a short pause, so typing does not fire a request per keystroke.
  useEffect(() => {
    const handle = setTimeout(() => {
      setQuery(search.trim());
      setPage(0);
    }, 250);
    return () => clearTimeout(handle);
  }, [search]);

  const path =
    `/users?page=${page + 1}&limit=${limit}&archived=${state === 'archived'}` +
    (query ? `&q=${encodeURIComponent(query)}` : '') +
    (role !== 'all' ? `&role=${role}` : '') +
    (department !== 'all' ? `&department_id=${department}` : '');
  const { data, error, retry } = useApiGet(path);

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

  const filters = [
    { value: role, onChange: (v) => { setRole(v); setPage(0); }, label: 'Filter by role', options: ROLE_FILTERS },
    {
      value: department,
      onChange: (v) => { setDepartment(v); setPage(0); },
      label: 'Filter by department',
      options: [{ value: 'all', label: 'All departments' }, ...(options?.departments ?? []).map((d) => ({ value: String(d.id), label: d.name }))],
    },
    { value: state, onChange: (v) => { setState(v); setPage(0); }, label: 'Active or archived', options: STATE_FILTERS },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Admin workspace · People & access"
        title="People & access"
        subtitle="Accounts, roles, who reports to whom, and each person's weekly hours."
        actions={
          <Button variant="contained" startIcon={<AddOutlined />} onClick={() => setCreating(true)}>
            Create user
          </Button>
        }
      />
      {!data && <LoadState error={error} onRetry={retry} />}
      {data && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 300px' }, gap: { xs: 2, lg: 2.5 }, alignItems: 'start' }}>
          <SectionCard
            title="People & access register"
            count={data.total}
            subtitle={`${data.counts.admin + data.counts.manager + data.counts.employee} active people · ${formatHours(CAPACITY)} weekly capacity baseline`}
            action={<SearchBar search={search} onSearch={setSearch} placeholder="Search people…" filters={filters} />}
            footer="Only administrators create accounts and change roles. Team assignment belongs to each manager."
          >
            {data.items.length === 0 ? (
              <EmptyState text={state === 'archived' ? 'No archived accounts match. Active accounts are listed under Active.' : 'No matching people. Try a different name or filter.'} />
            ) : (
              <PeopleTable people={data.items} onOpen={(id) => open('person', id)} />
            )}
            <TablePagination
              component="div"
              count={data.total}
              page={Math.min(page, Math.max(Math.ceil(data.total / limit) - 1, 0))}
              onPageChange={(_, next) => setPage(next)}
              rowsPerPage={limit}
              rowsPerPageOptions={PAGE_SIZES}
              onRowsPerPageChange={(event) => {
                setLimit(Number(event.target.value));
                setPage(0);
              }}
              labelRowsPerPage="Per page"
              sx={{ borderTop: 1, borderColor: 'divider', '& .MuiTablePagination-toolbar': { minHeight: 44 }, '& p': { fontSize: 11 } }}
            />
          </SectionCard>

          <SectionCard title="Access" subtitle="Active accounts by role.">
            <FigureRow label="Employees" value={String(data.counts.employee)} />
            <Divider />
            <FigureRow label="Managers" value={String(data.counts.manager)} />
            <Divider />
            <FigureRow label="Admins" value={String(data.counts.admin)} />
            <Divider />
            <FigureRow label="Archived" value={String(data.counts.archived)} />
            <Divider />
            <Typography color="text.secondary" sx={{ px: 2, py: 1.75, fontSize: 11 }}>
              Archiving keeps history and revokes sign-in at once. A manager cannot be archived while they own
              active projects or have direct reports; an employee cannot while they have open tasks.
            </Typography>
          </SectionCard>
        </Box>
      )}

      <SidePanel open={creating} title="Create user" onClose={() => setCreating(false)}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The username is generated when the account is saved. Give the person the username and temporary password shown afterwards.
        </Typography>
        <PersonForm
          options={options}
          onSaved={(saved, password) => {
            setCreating(false);
            retry();
            setCredentials({ name: saved.name, username: saved.username, password });
          }}
          onCancel={() => setCreating(false)}
        />
      </SidePanel>
      <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} />
    </>
  );
}

function PeopleTable({ people, onOpen }) {
  return (
    <TableContainer>
      <Table size="small" sx={{ minWidth: 760 }}>
        <TableHead>
          <TableRow>
            <TableCell>Person</TableCell>
            <TableCell>Role / department</TableCell>
            <TableCell sx={{ width: 170 }}>Weekly allocation</TableCell>
            <TableCell>Manager</TableCell>
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
                  <Typography sx={{ fontFamily: monoFont, fontSize: 10, color: '#7a8c7e', mt: 0.5, ml: 5.25 }}>{p.code}</Typography>
                </TableCell>
                <TableCell>
                  <StatusChip status={p.is_archived ? 'archived' : p.role} map={ROLE} />
                  <Typography color="text.secondary" component="p" sx={{ fontSize: 10, mt: 0.5 }}>
                    {[p.department, p.team_names.join(', ')].filter(Boolean).join(' · ') || 'No department'}
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
                <TableCell sx={{ fontSize: 12 }}>{p.manager_name ?? '—'}</TableCell>
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
      code: PropTypes.string,
      name: PropTypes.string.isRequired,
      email: PropTypes.string,
      role: PropTypes.string.isRequired,
      department: PropTypes.string,
      manager_name: PropTypes.string,
      is_archived: PropTypes.bool,
      team_names: PropTypes.arrayOf(PropTypes.string).isRequired,
      hours_this_week: PropTypes.number.isRequired,
      over_capacity: PropTypes.bool,
    }),
  ).isRequired,
  onOpen: PropTypes.func.isRequired,
};
