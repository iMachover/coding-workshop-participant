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
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useApiGet } from '../../hooks/useApiGet';
import { AUDIT_ACTION, AUDIT_TONE } from '../../config/statuses';
import { EmptyState } from '../../components/EmptyState';
import { LoadState } from '../../components/LoadState';
import { SearchBar } from '../../components/SearchBar';
import { SectionCard } from '../../components/SectionCard';
import { SidePanel } from '../../components/SidePanel';
import { StatusChip } from '../../components/StatusChip';
import { PageHeader } from '../../layout/PageHeader';
import { monoFont } from '../../theme';
import { formatWhen } from '../../utils/format';

const PAGE_SIZES = [10, 25, 50, 100];
const ENTITY_LABELS = { project: 'Project', user: 'User', task: 'Task', milestone: 'Milestone', team: 'Team' };

/** Chip map for the action column: label from AUDIT_ACTION, tone from AUDIT_TONE. */
const ACTION_CHIPS = Object.fromEntries(Object.entries(AUDIT_ACTION).map(([k, label]) => [k, { label, tone: AUDIT_TONE[k] ?? 'info' }]));

/**
 * Audit activity (ADMIN.md §6.4, prototype `RolePage page="Audit"`): every change in the
 * workspace, newest first, with search, action / entity / actor filters, a date range and
 * pagination. View change opens the before / after panel. Data: GET /audit.
 */
export function AuditPage() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [action, setAction] = useState('all');
  const [entity, setEntity] = useState('all');
  const [actor, setActor] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(25);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      setQuery(search.trim());
      setPage(0);
    }, 250);
    return () => clearTimeout(handle);
  }, [search]);

  const path =
    `/audit?page=${page + 1}&limit=${limit}` +
    (query ? `&q=${encodeURIComponent(query)}` : '') +
    (action !== 'all' ? `&action=${action}` : '') +
    (entity !== 'all' ? `&entity_type=${entity}` : '') +
    (actor !== 'all' ? `&actor_id=${actor}` : '') +
    (from ? `&from=${from}` : '') +
    (to ? `&to=${to}` : '');
  const { data, error, retry } = useApiGet(path);
  const reset = (setter) => (value) => {
    setter(value);
    setPage(0);
  };

  const filters = data
    ? [
        { value: action, onChange: reset(setAction), label: 'Filter by action', options: [{ value: 'all', label: 'All actions' }, ...data.actions.map((a) => ({ value: a, label: AUDIT_ACTION[a] ?? a }))] },
        { value: entity, onChange: reset(setEntity), label: 'Filter by record type', options: [{ value: 'all', label: 'All records' }, ...data.entity_types.map((e) => ({ value: e, label: ENTITY_LABELS[e] ?? e }))] },
        { value: actor, onChange: reset(setActor), label: 'Filter by actor', options: [{ value: 'all', label: 'Everyone' }, ...data.actors.map((a) => ({ value: String(a.id), label: a.name }))] },
      ]
    : [];

  return (
    <>
      <PageHeader
        eyebrow="Admin workspace · Audit activity"
        title="Audit activity"
        subtitle="Who changed what, when. Every write by every role, newest first; nothing here can be edited or deleted."
      />
      {!data && <LoadState error={error} onRetry={retry} />}
      {data && (
        <SectionCard
          title="Organization activity"
          count={data.total}
          subtitle="Append-only event history. Times are shown in your local time zone."
          action={
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.25 }}>
              <SearchBar search={search} onSearch={setSearch} placeholder="Search actors or records…" filters={filters} />
              <TextField size="small" type="date" label="From" value={from} onChange={(e) => reset(setFrom)(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={{ width: 150 }} />
              <TextField size="small" type="date" label="To" value={to} onChange={(e) => reset(setTo)(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: from || undefined } }} sx={{ width: 150 }} />
            </Box>
          }
          footer="Audit records cannot be edited or deleted. They are written in the same transaction as the change they describe."
        >
          {data.items.length === 0 ? (
            <EmptyState text={data.total === 0 && !query && action === 'all' ? 'No activity recorded yet.' : 'No events match this search. Clear the filters to view the full history.'} />
          ) : (
            <AuditTable entries={data.items} onOpen={setSelected} />
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
      <AuditEntryPanel entryId={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function AuditTable({ entries, onOpen }) {
  return (
    <TableContainer>
      <Table size="small" sx={{ minWidth: 760 }}>
        <TableHead>
          <TableRow>
            <TableCell>Time</TableCell>
            <TableCell>Actor</TableCell>
            <TableCell>Action</TableCell>
            <TableCell>Record</TableCell>
            <TableCell>Summary</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {entries.map((e) => (
            <TableRow key={e.id} hover sx={{ cursor: 'pointer' }} onClick={() => onOpen(e.id)}>
              <TableCell sx={{ whiteSpace: 'nowrap', fontSize: 12 }}>{formatWhen(e.created_at)}</TableCell>
              <TableCell>
                <Typography sx={{ fontSize: 12 }}>{e.actor_name}</Typography>
                <Typography color="text.secondary" component="p" sx={{ fontSize: 10 }}>
                  {e.actor_role}
                </Typography>
              </TableCell>
              <TableCell>
                <StatusChip status={e.action} map={ACTION_CHIPS} />
              </TableCell>
              <TableCell>
                <Typography sx={{ fontFamily: monoFont, fontSize: 11 }}>{e.entity_code ?? '—'}</Typography>
                <Typography color="text.secondary" component="p" sx={{ fontSize: 10 }}>
                  {ENTITY_LABELS[e.entity_type] ?? e.entity_type}
                </Typography>
              </TableCell>
              <TableCell sx={{ fontSize: 12 }}>{e.summary}</TableCell>
              <TableCell align="right">
                <Button variant="text" size="small" onClick={(event) => { event.stopPropagation(); onOpen(e.id); }}>
                  View change
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/** One entry's before / after fields (prototype "Audit event details" drawer). */
function AuditEntryPanel({ entryId, onClose }) {
  const { data, error, loading, retry } = useApiGet(entryId ? `/audit/${entryId}` : null);
  const entry = loading ? null : data;
  return (
    <SidePanel open={entryId !== null} title="Audit event details" onClose={onClose}>
      {!entry && <LoadState error={error} onRetry={retry} />}
      {entry && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap', mb: 2 }}>
            <StatusChip status={entry.action} map={ACTION_CHIPS} />
            <Typography sx={{ fontFamily: monoFont, fontSize: 11, color: 'text.secondary' }}>{entry.entity_code ?? ENTITY_LABELS[entry.entity_type]}</Typography>
          </Box>
          <Typography sx={{ fontSize: 13, fontWeight: 650 }}>{entry.summary}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, my: 2.5 }}>
            <Detail label="When" value={new Date(entry.created_at).toLocaleString()} />
            <Detail label="Actor" value={`${entry.actor_name} · ${entry.actor_role}`} />
            <Detail label="Record" value={`${ENTITY_LABELS[entry.entity_type] ?? entry.entity_type} ${entry.entity_code ?? `#${entry.entity_id}`}`} />
            <Detail label="Event id" value={String(entry.id)} />
          </Box>
          <Typography variant="h3" sx={{ mb: 1 }}>
            Change
          </Typography>
          {entry.changes.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              This event recorded no field values.
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Field</TableCell>
                    <TableCell>Before</TableCell>
                    <TableCell>After</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {entry.changes.map((c) => (
                    <TableRow key={c.field}>
                      <TableCell sx={{ fontFamily: monoFont, fontSize: 11 }}>{c.field}</TableCell>
                      <TableCell sx={{ fontSize: 12, color: 'text.secondary' }}>{show(c.before)}</TableCell>
                      <TableCell sx={{ fontSize: 12 }}>{show(c.after)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          <Box sx={{ mt: 2.5, p: 1.75, bgcolor: '#eff3e5', color: '#4c6954', borderRadius: '5px', fontSize: 12 }}>
            Read-only event. Original and changed values stay recorded.
          </Box>
        </>
      )}
    </SidePanel>
  );
}

/** A stored value as text: nulls as a dash, objects and lists as JSON. */
function show(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
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

AuditTable.propTypes = {
  entries: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.number.isRequired,
      created_at: PropTypes.string.isRequired,
      actor_name: PropTypes.string.isRequired,
      actor_role: PropTypes.string,
      action: PropTypes.string.isRequired,
      entity_type: PropTypes.string.isRequired,
      entity_code: PropTypes.string,
      summary: PropTypes.string.isRequired,
    }),
  ).isRequired,
  onOpen: PropTypes.func.isRequired,
};

AuditEntryPanel.propTypes = { entryId: PropTypes.number, onClose: PropTypes.func.isRequired };
