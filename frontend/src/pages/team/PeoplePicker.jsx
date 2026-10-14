import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useRefresh } from '../../context/useRefresh';
import { searchEmployees } from '../../services/peopleService';
import { formatHours } from '../../utils/format';

const ALL_TITLES = '';

/**
 * Manager's people picker (owner decision 2026-10-14): filter by job title and name, see the
 * first 25 matches, pick one (`multiple` false) or several. The server only offers the
 * manager's own direct reports and unassigned employees, never another manager's, and
 * leaves out anyone already on `excludeTeamId`.
 *
 * @param {{ value: number[]|number|'', onChange: (value: number[]|number|'') => void, onPick?: (person: object) => void, multiple?: boolean,
 *           jobTitles: string[], excludeTeamId?: number, label?: string, helperText?: string, error?: boolean }} props
 */
export function PeoplePicker({ value, onChange, onPick, multiple = false, jobTitles, excludeTeamId, label = 'People', helperText, error = false }) {
  const { version } = useRefresh();
  const [title, setTitle] = useState(ALL_TITLES);
  const [search, setSearch] = useState('');
  const [result, setResult] = useState(null);
  const [failed, setFailed] = useState(false);
  // People picked so far, by id, so a selection survives a filter change that hides it.
  const [picked, setPicked] = useState({});

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      searchEmployees({ q: search, job_title: title, exclude_team_id: excludeTeamId }).then(
        (data) => live && (setResult(data), setFailed(false)),
        () => live && setFailed(true),
      );
    }, search ? 250 : 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [search, title, excludeTeamId, version]);

  const selected = multiple ? value : value === '' ? [] : [value];
  const isSelected = (id) => selected.includes(id);

  function toggle(person) {
    setPicked((p) => ({ ...p, [person.id]: person }));
    if (onPick && !isSelected(person.id)) onPick(person);
    if (multiple) onChange(isSelected(person.id) ? value.filter((id) => id !== person.id) : [...value, person.id]);
    else onChange(isSelected(person.id) ? '' : person.id);
  }

  const items = result?.items ?? [];
  let status;
  if (failed) status = 'Could not load people. Check your connection and try again.';
  else if (!result) status = 'Loading…';
  else if (items.length === 0) status = search || title ? 'No one matches. Try another title or name.' : excludeTeamId ? 'Everyone you can pick is already on this team.' : 'No one to pick yet. Administrators create accounts.';
  else if (result.total > result.limit) status = `Showing the first ${result.limit} of ${result.total}. Narrow by job title or name.`;
  else status = `${result.total} ${result.total === 1 ? 'person' : 'people'}`;

  return (
    <Box sx={{ display: 'grid', gap: 1.25 }}>
      <Typography component="p" sx={{ fontSize: 12, fontWeight: 650 }}>
        {label}
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
        <TextField select label="Job title" value={title} onChange={(e) => setTitle(e.target.value)} size="small">
          <MenuItem value={ALL_TITLES}>All titles</MenuItem>
          {jobTitles.map((t) => (
            <MenuItem key={t} value={t}>{t}</MenuItem>
          ))}
        </TextField>
        <TextField label="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} size="small" slotProps={{ htmlInput: { 'aria-label': 'Search by name' } }} />
      </Box>
      {multiple && selected.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          {selected.map((id) => (
            <Chip key={id} size="small" label={picked[id]?.name ?? items.find((p) => p.id === id)?.name ?? `#${id}`} onDelete={() => onChange(value.filter((v) => v !== id))} />
          ))}
        </Box>
      )}
      <List
        dense
        disablePadding
        aria-label={label}
        sx={{ border: 1, borderColor: error ? 'error.main' : 'divider', borderRadius: '5px', maxHeight: 264, overflowY: 'auto', bgcolor: 'background.paper' }}
      >
        {items.map((p) => (
          <ListItemButton key={p.id} selected={isSelected(p.id)} onClick={() => toggle(p)} role={multiple ? 'checkbox' : 'option'} aria-selected={isSelected(p.id)} sx={{ gap: 1, py: 0.75 }}>
            {multiple && <Checkbox size="small" checked={isSelected(p.id)} tabIndex={-1} disableRipple sx={{ p: 0 }} />}
            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
              <Typography sx={{ fontSize: 12 }} noWrap>
                {p.name}
              </Typography>
              <Typography color="text.secondary" sx={{ fontSize: 10 }} noWrap>
                {p.job_title ?? 'Employee'} · {formatHours(p.hours_this_week)} this week
              </Typography>
            </Box>
            <Typography color={p.manager_id == null ? 'warning.dark' : 'text.secondary'} sx={{ fontSize: 10, whiteSpace: 'nowrap' }}>
              {p.manager_id == null ? 'Unassigned' : 'Reports to you'}
            </Typography>
          </ListItemButton>
        ))}
        {items.length === 0 && (
          <Typography color="text.secondary" sx={{ fontSize: 11, px: 1.5, py: 1.25 }}>
            {status}
          </Typography>
        )}
      </List>
      <Typography color={error ? 'error' : 'text.secondary'} sx={{ fontSize: 10.5 }}>
        {helperText ?? (items.length ? status : 'Unassigned people become your direct reports when picked.')}
      </Typography>
    </Box>
  );
}

PeoplePicker.propTypes = {
  value: PropTypes.oneOfType([PropTypes.arrayOf(PropTypes.number), PropTypes.number, PropTypes.oneOf([''])]).isRequired,
  onChange: PropTypes.func.isRequired,
  onPick: PropTypes.func,
  multiple: PropTypes.bool,
  jobTitles: PropTypes.arrayOf(PropTypes.string).isRequired,
  excludeTeamId: PropTypes.number,
  label: PropTypes.string,
  helperText: PropTypes.string,
  error: PropTypes.bool,
};
