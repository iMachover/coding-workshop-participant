import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useRefresh } from '../../context/useRefresh';
import { useToast } from '../../context/useToast';
import { useApiGet } from '../../hooks/useApiGet';
import { usePanelParams } from '../../hooks/usePanelParams';
import { EmptyState } from '../../components/EmptyState';
import { LoadState } from '../../components/LoadState';
import { SearchBar } from '../../components/SearchBar';
import { SectionCard } from '../../components/SectionCard';
import { SidePanel } from '../../components/SidePanel';
import { StatusChip } from '../../components/StatusChip';
import { PageHeader } from '../../layout/PageHeader';
import { restoreUser } from '../../services/peopleService';
import { restoreProject } from '../../services/projectsService';
import { monoFont } from '../../theme';
import { formatDate } from '../../utils/format';

const PAGE_SIZES = [10, 25, 50, 100];
const TYPE_FILTERS = [
  { value: 'all', label: 'Projects and users' },
  { value: 'project', label: 'Projects' },
  { value: 'user', label: 'Users' },
];
const ARCHIVED = { archived: { label: 'Archived', tone: 'muted' } };
const TYPE_LABEL = { project: 'Project', user: 'User' };

/**
 * Archives (ADMIN.md §6.5, prototype `RolePage page="Archives"`): archived projects and users
 * in one list with search and a type filter; Restore record asks for confirmation and returns
 * the record to active use. Data: GET /archives; restores go through the project and user routes.
 */
export function ArchivesPage() {
  const { open } = usePanelParams();
  const { bump } = useRefresh();
  const showToast = useToast();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(25);
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => {
      setQuery(search.trim());
      setPage(0);
    }, 250);
    return () => clearTimeout(handle);
  }, [search]);

  const path = `/archives?page=${page + 1}&limit=${limit}` + (query ? `&q=${encodeURIComponent(query)}` : '') + (type !== 'all' ? `&type=${type}` : '');
  const { data, error, retry } = useApiGet(path);

  async function restore() {
    setBusy(true);
    try {
      await (pending.type === 'project' ? restoreProject(pending.id) : restoreUser(pending.id));
      showToast(`${pending.code} ${pending.name} restored`);
      setPending(null);
      bump();
    } catch (err) {
      showToast(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Admin workspace · Archives"
        title="Archives"
        subtitle="Archived projects and accounts. Restore returns a record to active use; nothing is permanently deleted."
      />
      {!data && <LoadState error={error} onRetry={retry} />}
      {data && (
        <SectionCard
          title="Archived records"
          count={data.total}
          subtitle={`${data.projects} ${data.projects === 1 ? 'project' : 'projects'} · ${data.users} ${data.users === 1 ? 'account' : 'accounts'} · available to administrators only`}
          action={<SearchBar search={search} onSearch={setSearch} placeholder="Search archives…" filter={type} onFilter={(v) => { setType(v); setPage(0); }} filterLabel="Filter by record type" filterOptions={TYPE_FILTERS} />}
          footer="Archiving keeps history and ownership. A restored project returns to its manager's lists; a restored account can sign in again."
        >
          {data.items.length === 0 ? (
            <EmptyState text={data.total === 0 && !query && type === 'all' ? 'No archived records. Active records remain in Projects and People & access.' : 'No archived records match this search.'} />
          ) : (
            <ArchivesTable items={data.items} onRestore={setPending} onOpen={(r) => open(r.type === 'project' ? 'selected' : 'person', r.id)} />
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
      )}

      <SidePanel open={pending !== null} title="Restore archived record?" onClose={() => setPending(null)}>
        {pending && (
          <>
            <Typography sx={{ fontFamily: monoFont, fontSize: 11, color: 'text.secondary' }}>
              {pending.code} · {TYPE_LABEL[pending.type]}
            </Typography>
            <Typography sx={{ fontSize: 14, fontWeight: 650, mt: 0.5 }}>{pending.name}</Typography>
            <Typography color="text.secondary" sx={{ fontSize: 12, mt: 0.25 }}>
              {pending.detail}
            </Typography>
            <Typography sx={{ fontSize: 12, mt: 2.5 }}>
              {pending.type === 'project'
                ? 'The project returns to the active register and to its manager and team members, with its milestones, tasks and hours as they were.'
                : 'The account can sign in again and reappears in lists and pickers, with its history intact.'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mt: 3 }}>
              <Button variant="contained" onClick={restore} disabled={busy}>
                Confirm restore
              </Button>
              <Button onClick={() => setPending(null)} disabled={busy}>
                Cancel
              </Button>
            </Box>
          </>
        )}
      </SidePanel>
    </>
  );
}

function ArchivesTable({ items, onRestore, onOpen }) {
  return (
    <TableContainer>
      <Table size="small" sx={{ minWidth: 720 }}>
        <TableHead>
          <TableRow>
            <TableCell>Record</TableCell>
            <TableCell>Type</TableCell>
            <TableCell>Archived</TableCell>
            <TableCell>State</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((r) => (
            <TableRow key={`${r.type}-${r.id}`} hover sx={{ cursor: 'pointer' }} onClick={() => onOpen(r)}>
              <TableCell>
                <Typography sx={{ fontFamily: monoFont, fontSize: 10, color: '#7a8c7e', mb: 0.25 }}>{r.code}</Typography>
                <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#294c49' }}>{r.name}</Typography>
                <Typography color="text.secondary" component="p" sx={{ fontSize: 10, mt: 0.25 }}>
                  {r.detail}
                </Typography>
              </TableCell>
              <TableCell sx={{ fontSize: 12 }}>{TYPE_LABEL[r.type]}</TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                <Typography sx={{ fontSize: 12 }}>{formatDate(r.archived_at.slice(0, 10))}</Typography>
                {r.archived_by && (
                  <Typography color="text.secondary" component="p" sx={{ fontSize: 10 }}>
                    by {r.archived_by}
                  </Typography>
                )}
              </TableCell>
              <TableCell>
                <StatusChip status="archived" map={ARCHIVED} />
              </TableCell>
              <TableCell align="right">
                <Button variant="outlined" size="small" onClick={(event) => { event.stopPropagation(); onRestore(r); }}>
                  Restore record
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

ArchivesTable.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({
      type: PropTypes.oneOf(['project', 'user']).isRequired,
      id: PropTypes.number.isRequired,
      code: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      detail: PropTypes.string,
      archived_at: PropTypes.string.isRequired,
      archived_by: PropTypes.string,
    }),
  ).isRequired,
  onRestore: PropTypes.func.isRequired,
  onOpen: PropTypes.func.isRequired,
};
