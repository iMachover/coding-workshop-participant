import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useAuth } from '../../context/useAuth';
import { useRefresh } from '../../context/useRefresh';
import { useToast } from '../../context/useToast';
import { useApiGet } from '../../hooks/useApiGet';
import { MILESTONE_STATUS, ROLE } from '../../config/statuses';
import { LoadState } from '../../components/LoadState';
import { Meter } from '../../components/Meter';
import { PersonCell } from '../../components/PersonCell';
import { SidePanel } from '../../components/SidePanel';
import { StatusChip } from '../../components/StatusChip';
import { archiveUser, fetchUserOptions, releaseEmployee, restoreUser } from '../../services/peopleService';
import { monoFont } from '../../theme';
import { formatDay, formatHours, formatMoney } from '../../utils/format';
import { PersonForm } from './PersonForm';

const CAPACITY = 40;

/**
 * Profile side panel for one person (prototype people drawer). Admins open anyone from
 * People & access and may edit every field, archive and restore; managers open their direct
 * reports from My team, may edit name and email, and may release the person back to the
 * unassigned pool (off every team of theirs). Driven by `?person=<id>` in the URL.
 *
 * @param {{ personId: number|null, onClose: () => void, onOpenProject: (id: number) => void }} props
 */
export function PersonPanel({ personId, onClose, onOpenProject }) {
  const { user } = useAuth();
  const { bump } = useRefresh();
  const showToast = useToast();
  const isAdmin = user.role === 'admin';
  const [mode, setMode] = useState('view'); // view | edit | archive | release
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState(null);
  const path = personId ? (isAdmin ? `/users/${personId}` : `/employees/${personId}`) : null;
  const { data, error, loading, retry } = useApiGet(path);
  const person = loading ? null : data;

  useEffect(() => {
    if (isAdmin && personId) fetchUserOptions().then(setOptions, () => setOptions(null));
  }, [isAdmin, personId]);

  function close() {
    setMode('view');
    onClose();
  }

  async function act(fn, message) {
    setBusy(true);
    try {
      await fn();
      showToast(message);
      bump();
      setMode('view');
    } catch (err) {
      showToast(err.message);
    } finally {
      setBusy(false);
    }
  }

  const title = mode === 'edit' ? (isAdmin ? 'Edit profile & role' : 'Edit name & email') : (person?.name ?? 'Profile');
  const free = person ? CAPACITY - person.hours_this_week : 0;

  return (
    <SidePanel open={personId !== null} title={title} onClose={close}>
      {!person && <LoadState error={error} onRetry={retry} />}
      {person && mode === 'edit' && (
        <PersonForm
          person={person}
          options={options}
          onSaved={() => {
            showToast('Profile saved');
            setMode('view');
            bump();
          }}
          onCancel={() => setMode('view')}
        />
      )}
      {person && mode !== 'edit' && (
        <>
          <PersonCell name={person.name} sub={person.email} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap', mt: 1.5 }}>
            <StatusChip status={person.is_archived ? 'archived' : person.role} map={ROLE} />
            <Typography sx={{ fontFamily: monoFont, fontSize: 11, color: 'text.secondary' }}>{person.code}</Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
              {[person.job_title, person.department].filter(Boolean).join(' · ')}
            </Typography>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2.25, my: 3 }}>
            <Detail label="Username" value={person.username} mono />
            <Detail label={person.role === 'employee' ? 'Reports to' : 'Direct reports'} value={person.role === 'employee' ? (person.manager_name ?? 'Unassigned') : String(person.direct_reports)} />
            <Detail label={person.team_names.length === 1 ? 'Team' : 'Teams'} value={person.team_names.length ? person.team_names.join(', ') : 'Not on a team yet'} />
            <Detail label="Hourly rate" value={`${formatMoney(person.hourly_rate)} / h`} />
            <Detail label="Cost this week" value={formatMoney(person.cost_this_week)} />
            <Detail label="Lifetime logged" value={`${formatHours(person.lifetime_hours)} · ${formatMoney(person.lifetime_cost)}`} />
          </Box>
          <Meter
            percent={(person.hours_this_week / CAPACITY) * 100}
            warn={person.over_capacity}
            label={`Weekly allocation · ${formatHours(person.hours_this_week)} / ${formatHours(CAPACITY)}`}
            valueLabel={person.over_capacity ? `${formatHours(-free)} over` : `${formatHours(free)} free`}
          />

          {!person.is_archived && (
            <Box sx={{ display: 'flex', gap: 1, mt: 2.5, flexWrap: 'wrap' }}>
              <Button onClick={() => setMode('edit')}>{isAdmin ? 'Edit profile & role' : 'Edit name & email'}</Button>
              {!isAdmin && mode === 'view' && (
                <Button color="error" onClick={() => setMode('release')}>
                  Release from your reports
                </Button>
              )}
            </Box>
          )}
          {mode === 'release' && (
            <Box role="group" aria-label="Confirm release" sx={{ mt: 2, p: 1.75, bgcolor: '#faf0d9', color: '#88601c', borderRadius: '5px' }}>
              <Typography sx={{ fontSize: 12, mb: 1.25 }}>
                Release {person.name}? They leave {person.team_names.length ? `${person.team_names.join(', ')} and ` : ''}your direct reports, and any manager can take them on from the employee list. Refused while they still have tasks that are not completed.
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  color="error"
                  variant="contained"
                  size="small"
                  disabled={busy}
                  onClick={async () => {
                    await act(() => releaseEmployee(person.id), `${person.name} released`);
                    close();
                  }}
                >
                  Confirm release
                </Button>
                <Button size="small" onClick={() => setMode('view')} disabled={busy} sx={{ color: 'inherit' }}>
                  Cancel
                </Button>
              </Box>
            </Box>
          )}

          <Typography variant="h3" sx={{ mt: 3, mb: 1.5 }}>
            Projects
          </Typography>
          {person.projects.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              {person.role === 'employee' ? 'Not on a project yet. Their manager assigns them through a team.' : 'No active projects.'}
            </Typography>
          )}
          {person.projects.map((p) => (
            <Box
              key={p.id}
              role="button"
              tabIndex={0}
              aria-label={`Open project ${p.name}`}
              onClick={() => onOpenProject(p.id)}
              onKeyDown={(event) => event.key === 'Enter' && onOpenProject(p.id)}
              sx={{ p: 1.75, bgcolor: '#edf2e8', borderRadius: '5px', mb: 1.25, fontSize: 12, cursor: 'pointer', '&:hover': { bgcolor: '#e3ebdd' } }}
            >
              <Typography sx={{ fontFamily: monoFont, fontSize: 10, color: '#7a8c7e' }}>
                {p.code} · {p.department}
                {p.relation === 'manages' ? ' · Manages' : ''}
                {p.status === 'closed' ? ' · Closed' : ''}
              </Typography>
              <Typography sx={{ fontSize: 12, fontWeight: 650, my: 0.5 }}>{p.name}</Typography>
              {p.relation === 'member' && (
                <Typography color="text.secondary" sx={{ fontSize: 11 }}>
                  {p.progress.completed} / {p.progress.total} tasks · {formatHours(p.actual_hours)} of {formatHours(p.planned_hours)} · {formatMoney(p.actual_cost)}
                </Typography>
              )}
            </Box>
          ))}

          {person.milestones.length > 0 && (
            <>
              <Typography variant="h3" sx={{ mt: 3, mb: 1.5 }}>
                Progress by milestone
              </Typography>
              {person.milestones.map((m) => (
                <Box key={m.id} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 1.5, alignItems: 'center', py: 1, borderTop: 1, borderColor: 'divider' }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 12 }} noWrap>
                      {String(m.sequence).padStart(2, '0')} · {m.name}
                    </Typography>
                    <Typography color="text.secondary" sx={{ fontSize: 10 }}>
                      {m.project_code} · {m.progress.completed} / {m.progress.total} tasks
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <StatusChip status={m.status} map={MILESTONE_STATUS} />
                    <Typography sx={{ fontFamily: monoFont, fontSize: 11, fontWeight: 600, minWidth: 34, textAlign: 'right' }}>{m.progress.percent}%</Typography>
                  </Box>
                </Box>
              ))}
            </>
          )}

          <Typography variant="h3" sx={{ mt: 3, mb: 1.5 }}>
            Recent time entries
          </Typography>
          {person.recent_entries.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No hours logged yet.
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Day / task</TableCell>
                    <TableCell>Hours</TableCell>
                    <TableCell>Cost</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {person.recent_entries.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>
                        <Typography sx={{ fontSize: 12 }}>{formatDay(e.work_date)}</Typography>
                        <Typography color="text.secondary" sx={{ fontSize: 10 }} noWrap>
                          {e.task_code} · {e.task_title}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ fontFamily: monoFont, fontSize: 11, whiteSpace: 'nowrap' }}>{formatHours(e.hours)}</TableCell>
                      <TableCell sx={{ fontFamily: monoFont, fontSize: 11, whiteSpace: 'nowrap' }}>{formatMoney(e.cost)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {isAdmin && mode === 'view' && (
            <Box sx={{ display: 'flex', gap: 1, mt: 3.25, pt: 2.25, borderTop: 1, borderColor: 'divider', flexWrap: 'wrap', alignItems: 'center' }}>
              {person.is_archived ? (
                <Button variant="contained" onClick={() => act(() => restoreUser(person.id), `${person.name} restored`)} disabled={busy}>
                  Restore account
                </Button>
              ) : (
                <Button color="error" onClick={() => setMode('archive')} disabled={!person.can_archive}>
                  Archive account
                </Button>
              )}
              {!person.is_archived && person.blockers.length > 0 && (
                <Typography color="text.secondary" sx={{ fontSize: 11, width: '100%' }}>
                  Cannot be archived yet: {person.blockers.join('; ')}.
                </Typography>
              )}
            </Box>
          )}
          {mode === 'archive' && (
            <Box sx={{ mt: 3, p: 2, bgcolor: '#eff3e5', borderRadius: '5px' }}>
              <Typography sx={{ fontSize: 12, mb: 1.5 }}>
                Archive {person.name}? They can no longer sign in, they leave every list and picker, and their history is kept. You can restore the account from Archives.
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button color="error" variant="contained" size="small" onClick={() => act(() => archiveUser(person.id), `${person.name} archived`)} disabled={busy}>
                  Confirm archive
                </Button>
                <Button size="small" onClick={() => setMode('view')} disabled={busy}>
                  Cancel
                </Button>
              </Box>
            </Box>
          )}
        </>
      )}
    </SidePanel>
  );
}

function Detail({ label, value, mono = false }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography component="p" color="text.secondary" sx={{ fontSize: 10, mb: 0.625 }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 12, fontFamily: mono ? monoFont : undefined }}>{value}</Typography>
    </Box>
  );
}

Detail.propTypes = { label: PropTypes.string.isRequired, value: PropTypes.string.isRequired, mono: PropTypes.bool };

PersonPanel.propTypes = {
  personId: PropTypes.number,
  onClose: PropTypes.func.isRequired,
  onOpenProject: PropTypes.func.isRequired,
};
