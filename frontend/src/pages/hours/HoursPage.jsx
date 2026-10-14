import PropTypes from 'prop-types';
import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined';
import AddOutlined from '@mui/icons-material/AddOutlined';
import ChevronLeftOutlined from '@mui/icons-material/ChevronLeftOutlined';
import ChevronRightOutlined from '@mui/icons-material/ChevronRightOutlined';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import EventAvailableOutlined from '@mui/icons-material/EventAvailableOutlined';
import PaidOutlined from '@mui/icons-material/PaidOutlined';
import { useAuth } from '../../context/useAuth';
import { useApiGet } from '../../hooks/useApiGet';
import { usePanelParams } from '../../hooks/usePanelParams';
import { TASK_STATUS } from '../../config/statuses';
import { EmptyState } from '../../components/EmptyState';
import { FigureRow } from '../../components/FigureRow';
import { LoadState } from '../../components/LoadState';
import { Meter } from '../../components/Meter';
import { SearchBar } from '../../components/SearchBar';
import { SectionCard } from '../../components/SectionCard';
import { StatCards } from '../../components/StatCards';
import { StatusChip } from '../../components/StatusChip';
import { PageHeader } from '../../layout/PageHeader';
import { ledgerPath } from '../../services/hoursService';
import { monoFont } from '../../theme';
import { formatDate, formatDay, formatHours, formatMoney } from '../../utils/format';
import { EntryPanel } from './EntryPanel';

const DAY = 86_400_000;

/** YYYY-MM-DD of a local Date. */
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Monday of the week containing `d`. */
function mondayOf(d) {
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day;
}

const shift = (monday, weeks) => new Date(monday.getTime() + weeks * 7 * DAY);
const sundayOf = (monday) => new Date(monday.getTime() + 6 * DAY);

/**
 * My hours (EMPLOYEE.md §6.5, prototype `RolePage page="Hours"`): this week's figures, the
 * ledger for one week at a time with navigation, View / correct per entry, Log hours and a
 * CSV export of the week shown. Data: GET /me/time-entries?from&to.
 */
export function HoursPage() {
  const { user } = useAuth();
  const { open } = usePanelParams();
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [search, setSearch] = useState('');
  const [entryId, setEntryId] = useState(null);
  const start = iso(monday);
  const end = iso(sundayOf(monday));
  const { data, error, retry } = useApiGet(ledgerPath(start, end));
  const thisWeek = iso(mondayOf(new Date())) === start;

  const query = search.trim().toLowerCase();
  const visible = (data?.entries ?? []).filter((e) => `${e.task_code} ${e.task_title} ${e.project_code} ${e.note ?? ''}`.toLowerCase().includes(query));
  const entry = (data?.entries ?? []).find((e) => e.id === entryId) ?? null;

  function exportCsv() {
    const rows = [
      ['Date', 'Task', 'Title', 'Project', 'Hours', 'Cost (USD)', 'Note'],
      ...visible.map((e) => [e.work_date, e.task_code, e.task_title, e.project_code, e.hours, e.cost, e.note ?? '']),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `hours-${start}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        eyebrow={`My workspace · ${user.first_name} ${user.last_name}`}
        title="My hours"
        subtitle="Hours you logged against your tasks, one week at a time, and what they cost."
        actions={
          <>
            <Button startIcon={<DownloadOutlined />} onClick={exportCsv} disabled={!visible.length}>
              Export CSV
            </Button>
            <Button variant="contained" startIcon={<AddOutlined />} onClick={() => open('log', 0)}>
              Log hours
            </Button>
          </>
        }
      />
      {!data && <LoadState error={error} onRetry={retry} />}
      {data && (
        <>
          <StatCards
            items={[
              { label: 'Logged this week', value: formatHours(data.hours_this_week), detail: `Week of ${formatDay(data.week.start)}`, icon: AccessTimeOutlined },
              { label: 'Weekly capacity', value: formatHours(data.week.capacity_hours), detail: `${formatHours(data.available_hours)} still free`, icon: EventAvailableOutlined },
              { label: 'Your cost this week', value: formatMoney(data.cost_this_week), detail: `${formatMoney(data.hourly_rate)} / h resource rate`, icon: PaidOutlined },
              { label: 'Lifetime logged', value: formatHours(data.lifetime_hours), detail: `${formatMoney(data.lifetime_cost)} resource cost`, icon: AccessTimeOutlined },
            ]}
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 300px' }, gap: { xs: 2, lg: 2.5 }, alignItems: 'start' }}>
            <SectionCard
              title="Your time ledger"
              count={visible.length}
              subtitle={`${formatDate(start)} to ${formatDate(end)} · ${formatHours(data.range_hours)} · ${formatMoney(data.range_cost)}`}
              action={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <SearchBar search={search} onSearch={setSearch} placeholder="Search logged work…" />
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <IconButton size="small" aria-label="Previous week" onClick={() => setMonday((m) => shift(m, -1))}>
                      <ChevronLeftOutlined fontSize="small" />
                    </IconButton>
                    <Button size="small" onClick={() => setMonday(mondayOf(new Date()))} disabled={thisWeek}>
                      This week
                    </Button>
                    <IconButton size="small" aria-label="Next week" onClick={() => setMonday((m) => shift(m, 1))} disabled={thisWeek}>
                      <ChevronRightOutlined fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
              }
              footer="No running timer. Record actual time after the work; entries on completed tasks are final."
            >
              {visible.length === 0 ? (
                <EmptyState text={data.entries.length ? 'No logged hours match. Try another task or project name.' : thisWeek ? 'Nothing logged this week yet. Use Log hours when the work is done.' : 'Nothing was logged that week.'} />
              ) : (
                <LedgerTable entries={visible} onOpen={setEntryId} />
              )}
            </SectionCard>

            <SectionCard title="This week">
              <Box sx={{ px: 2.25, py: 2 }}>
                <Meter percent={(data.hours_this_week / data.week.capacity_hours) * 100} warn={data.hours_this_week > data.week.capacity_hours} label="Logged" valueLabel={`${formatHours(data.hours_this_week)} / ${formatHours(data.week.capacity_hours)}`} />
                <Typography color="text.secondary" component="p" sx={{ mt: 1, fontSize: 10 }}>
                  Monday to Sunday. Capacity is a planning signal, not an attendance measure.
                </Typography>
              </Box>
              <Divider />
              <FigureRow label="Weekly capacity" value={formatHours(data.week.capacity_hours)} />
              <Divider />
              <FigureRow label="Expected working day" value={formatHours(8)} />
              <Divider />
              <FigureRow label="Tasks you can log on" value={String(data.loggable_tasks.length)} />
              {data.loggable_tasks.length === 0 && (
                <Typography color="text.secondary" sx={{ px: 2, pb: 1.75, fontSize: 11 }}>
                  Start an assigned task to log hours on it.
                </Typography>
              )}
            </SectionCard>
          </Box>
        </>
      )}
      <EntryPanel entry={entry} onClose={() => setEntryId(null)} />
    </>
  );
}

function LedgerTable({ entries, onOpen }) {
  return (
    <TableContainer>
      <Table size="small" sx={{ minWidth: 640 }}>
        <TableHead>
          <TableRow>
            <TableCell>Day / task</TableCell>
            <TableCell>Project</TableCell>
            <TableCell>Hours</TableCell>
            <TableCell>Resource cost</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {entries.map((e) => (
            <TableRow key={e.id} hover sx={{ cursor: 'pointer' }} onClick={() => onOpen(e.id)}>
              <TableCell>
                <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#294c49' }}>{formatDate(e.work_date)}</Typography>
                <Typography color="text.secondary" component="p" sx={{ fontSize: 10, mt: 0.25 }}>
                  {e.task_code} · {e.task_title}
                </Typography>
                {e.note && (
                  <Typography color="text.secondary" component="p" sx={{ fontSize: 10, mt: 0.25, fontStyle: 'italic' }} noWrap>
                    {e.note}
                  </Typography>
                )}
              </TableCell>
              <TableCell>
                <Typography sx={{ fontFamily: monoFont, fontSize: 11 }}>{e.project_code}</Typography>
                <Box sx={{ mt: 0.5 }}>
                  <StatusChip status={e.task_status} map={TASK_STATUS} />
                </Box>
              </TableCell>
              <TableCell sx={{ fontFamily: monoFont, fontSize: 11, whiteSpace: 'nowrap' }}>{formatHours(e.hours)}</TableCell>
              <TableCell sx={{ fontFamily: monoFont, fontSize: 11, whiteSpace: 'nowrap' }}>{formatMoney(e.cost)}</TableCell>
              <TableCell align="right">
                <Button variant="text" size="small" onClick={(event) => { event.stopPropagation(); onOpen(e.id); }}>
                  {e.editable ? 'View / correct' : 'View'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

LedgerTable.propTypes = {
  entries: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.number.isRequired,
      work_date: PropTypes.string.isRequired,
      hours: PropTypes.number.isRequired,
      cost: PropTypes.number,
      note: PropTypes.string,
      task_code: PropTypes.string,
      task_title: PropTypes.string,
      task_status: PropTypes.string,
      project_code: PropTypes.string,
      editable: PropTypes.bool,
    }),
  ).isRequired,
  onOpen: PropTypes.func.isRequired,
};
