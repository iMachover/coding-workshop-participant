import PropTypes from 'prop-types';
import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import { useRefresh } from '../../context/useRefresh';
import { useToast } from '../../context/useToast';
import { SidePanel } from '../../components/SidePanel';
import { addTeamMember, assignEmployee, attachTeam, createTeam, detachTeam, removeTeamMember, renameTeam } from '../../services/peopleService';
import { monoFont } from '../../theme';
import { formatHours } from '../../utils/format';
import { PeoplePicker } from './PeoplePicker';

/**
 * Manager's team panel (prototype "Create team" / "Assign employee" drawers and the Teams
 * section). `mode` is 'create' (new team), 'assign' (take an employee on and/or put them on
 * a team) or 'manage' (rename, members, projects of `team`).
 *
 * People come from the PeoplePicker (job title filter, name search, first 25): the manager's
 * own direct reports and unassigned employees, who become direct reports when picked. Another
 * manager's people are never offered; an admin moves them.
 *
 * @param {{ mode: 'create'|'assign'|'manage'|null, team?: object, teams: object[],
 *           options: { people: object[], projects: object[] } | null, onClose: () => void }} props
 */
export function TeamPanel({ mode, team, teams, options, onClose }) {
  const titles = { create: 'Create team', assign: 'Assign employee', manage: team ? `${team.code} · ${team.name}` : 'Team' };
  return (
    <SidePanel open={mode !== null} title={titles[mode] ?? 'Team'} onClose={onClose}>
      {mode === 'create' && <CreateTeamForm options={options} onDone={onClose} />}
      {mode === 'assign' && <AssignForm teams={teams} options={options} onDone={onClose} />}
      {mode === 'manage' && team && <ManageTeam team={team} options={options} />}
      {mode === 'manage' && !team && (
        <Typography variant="body2" color="text.secondary">
          This team no longer exists.
        </Typography>
      )}
    </SidePanel>
  );
}

/** Runs a write, toasts the outcome and reloads the page's data. Returns true on success. */
function useAction() {
  const { bump } = useRefresh();
  const showToast = useToast();
  const [busy, setBusy] = useState(false);
  async function act(fn, message) {
    setBusy(true);
    try {
      await fn();
      showToast(message);
      bump();
      return true;
    } catch (err) {
      showToast(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { act, busy };
}

function CreateTeamForm({ options, onDone }) {
  const [values, setValues] = useState({ name: '', member_ids: [], project_id: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const { bump } = useRefresh();
  const showToast = useToast();

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const saved = await createTeam({
        name: values.name,
        member_ids: values.member_ids.map(Number),
        project_id: values.project_id === '' ? null : Number(values.project_id),
      });
      showToast(`Team ${saved.name} created`);
      bump();
      onDone();
    } catch (err) {
      setErrors(err.fields ?? { form: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box component="form" onSubmit={submit} sx={{ display: 'grid', gap: 2 }}>
      <TextField label="Team name" value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} required error={!!errors.name} helperText={errors.name} />
      <PeoplePicker
        multiple
        label="Members"
        value={values.member_ids}
        onChange={(member_ids) => setValues((v) => ({ ...v, member_ids }))}
        jobTitles={options?.job_titles ?? []}
        helperText={errors.member_ids ?? errors.user_id}
        error={!!errors.member_ids || !!errors.user_id}
      />
      <TextField select label="Assigned project" value={values.project_id} onChange={(e) => setValues((v) => ({ ...v, project_id: e.target.value }))} error={!!errors.project_id} helperText={errors.project_id ?? 'Optional. Only members of an attached team can be given tasks on the project.'}>
        <MenuItem value="">None yet</MenuItem>
        {(options?.projects ?? []).map((p) => (
          <MenuItem key={p.id} value={p.id}>{p.code} · {p.name}</MenuItem>
        ))}
      </TextField>
      {errors.form && (
        <Typography variant="caption" color="error">
          {errors.form}
        </Typography>
      )}
      <Box sx={{ display: 'flex', gap: 1, pt: 1 }}>
        <Button type="submit" variant="contained" disabled={saving}>
          {saving ? 'Saving…' : 'Create team'}
        </Button>
        <Button type="button" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
      </Box>
    </Box>
  );
}

function AssignForm({ teams, options, onDone }) {
  const [userId, setUserId] = useState('');
  const [person, setPerson] = useState(null);
  const [teamId, setTeamId] = useState(teams[0]?.id ?? '');
  const { act, busy } = useAction();
  const target = teams.find((t) => t.id === teamId);
  const unassigned = person?.manager_id == null;

  let outcome = 'Pick a person. Someone unassigned becomes your direct report.';
  if (person && !unassigned) outcome = target ? `${person.name} already reports to you and joins ${target.name}.` : `${person.name} already reports to you. Pick a team to put them on.`;
  if (person && unassigned) outcome = target ? `${person.name} becomes your direct report and joins ${target.name}.` : `${person.name} becomes your direct report. You can put them on a team later.`;

  async function submit(event) {
    event.preventDefault();
    const done = target
      ? await act(() => addTeamMember(teamId, userId), unassigned ? `${person.name} now reports to you and is on ${target.name}` : `${person.name} added to ${target.name}`)
      : await act(() => assignEmployee(userId), `${person.name} now reports to you`);
    if (done) onDone();
  }

  return (
    <Box component="form" onSubmit={submit} sx={{ display: 'grid', gap: 2 }}>
      <TextField select label="Team" value={teamId} onChange={(e) => setTeamId(e.target.value === '' ? '' : Number(e.target.value))} helperText={teams.length ? 'People already on this team are left out below.' : 'No teams yet. You can still take someone on and create a team afterwards.'}>
        <MenuItem value="">No team yet</MenuItem>
        {teams.map((t) => (
          <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
        ))}
      </TextField>
      <PeoplePicker
        label="Employee"
        value={userId}
        onChange={(id) => {
          setUserId(id);
          if (id === '') setPerson(null);
        }}
        onPick={setPerson}
        jobTitles={options?.job_titles ?? []}
        excludeTeamId={target?.id}
      />
      <Typography color="text.secondary" sx={{ fontSize: 11 }}>
        {outcome} Review capacity above {formatHours(40)} with the employee before adding work.
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, pt: 1 }}>
        <Button type="submit" variant="contained" disabled={busy || !person || (!unassigned && !target)}>
          {target ? 'Add to team' : 'Add as direct report'}
        </Button>
        <Button type="button" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
      </Box>
    </Box>
  );
}

function ManageTeam({ team, options }) {
  const [name, setName] = useState(team.name);
  const [memberId, setMemberId] = useState('');
  const [candidate, setCandidate] = useState(null);
  const [projectId, setProjectId] = useState('');
  // A removal waits for confirmation: { kind: 'member' | 'project', item }.
  const [pending, setPending] = useState(null);
  const { act, busy } = useAction();
  const attachable = (options?.projects ?? []).filter((p) => !team.projects.some((tp) => tp.id === p.id));

  return (
    <>
      <Box
        component="form"
        onSubmit={async (event) => {
          event.preventDefault();
          await act(() => renameTeam(team.id, name), 'Team renamed');
        }}
        sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}
      >
        <TextField label="Team name" value={name} onChange={(e) => setName(e.target.value)} required size="small" sx={{ flexGrow: 1 }} />
        <Button type="submit" disabled={busy || name.trim() === team.name || !name.trim()}>
          Rename
        </Button>
      </Box>
      <Typography color="text.secondary" sx={{ fontSize: 11, mt: 1 }}>
        {formatHours(team.hours_this_week)} logged by this team this week.
      </Typography>

      <Typography variant="h3" sx={{ mt: 3, mb: 1.25 }}>
        Members
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1.5 }}>
        {team.members.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            Nobody yet.
          </Typography>
        )}
        {team.members.map((m) => (
          <Chip
            key={m.id}
            label={`${m.name} · ${formatHours(m.hours_this_week)}`}
            onDelete={() => setPending({ kind: 'member', item: m })}
            deleteIcon={<CloseOutlined aria-label={`Remove ${m.name}`} />}
            disabled={busy}
            size="small"
          />
        ))}
      </Box>
      {pending?.kind === 'member' && (
        <ConfirmBox
          text={`Remove ${pending.item.name} from ${team.name}? Their tasks stay assigned, but they can no longer be given new tasks on this team's projects.`}
          busy={busy}
          onConfirm={async () => {
            if (await act(() => removeTeamMember(team.id, pending.item.id), `${pending.item.name} removed from ${team.name}`)) setPending(null);
          }}
          onCancel={() => setPending(null)}
        />
      )}
      <Box
        component="form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (await act(() => addTeamMember(team.id, memberId), `${candidate?.name} added to ${team.name}`)) {
            setMemberId('');
            setCandidate(null);
          }
        }}
        sx={{ display: 'grid', gap: 1.25 }}
      >
        <PeoplePicker
          label="Add a person"
          value={memberId}
          onChange={(id) => {
            setMemberId(id);
            if (id === '') setCandidate(null);
          }}
          onPick={setCandidate}
          jobTitles={options?.job_titles ?? []}
          excludeTeamId={team.id}
        />
        <Box>
          <Button type="submit" variant="contained" size="small" disabled={busy || !memberId}>
            Add to team
          </Button>
        </Box>
      </Box>

      <Typography variant="h3" sx={{ mt: 3, mb: 1.25 }}>
        Projects
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1.5 }}>
        {team.projects.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            Not attached to a project yet. Attach one so its members can be given tasks.
          </Typography>
        )}
        {team.projects.map((p) => (
          <Chip
            key={p.id}
            label={`${p.code} · ${p.name}`}
            onDelete={() => setPending({ kind: 'project', item: p })}
            deleteIcon={<CloseOutlined aria-label={`Detach ${p.code}`} />}
            disabled={busy}
            size="small"
            sx={{ '& .MuiChip-label': { fontFamily: monoFont, fontSize: 10 } }}
          />
        ))}
      </Box>
      {pending?.kind === 'project' && (
        <ConfirmBox
          text={`Detach ${team.name} from ${pending.item.code} · ${pending.item.name}? Existing tasks stay, but its members can no longer be given new tasks there.`}
          busy={busy}
          onConfirm={async () => {
            if (await act(() => detachTeam(pending.item.id, team.id), `${team.name} removed from ${pending.item.code}`)) setPending(null);
          }}
          onCancel={() => setPending(null)}
        />
      )}
      <Box
        component="form"
        onSubmit={async (event) => {
          event.preventDefault();
          const project = attachable.find((p) => p.id === projectId);
          if (await act(() => attachTeam(projectId, team.id), `${team.name} assigned to ${project?.code}`)) setProjectId('');
        }}
        sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}
      >
        <TextField select label="Attach to a project" value={projectId} onChange={(e) => setProjectId(Number(e.target.value))} size="small" sx={{ flexGrow: 1 }} disabled={attachable.length === 0} helperText={attachable.length === 0 ? 'This team is on every active project you manage.' : undefined}>
          {attachable.map((p) => (
            <MenuItem key={p.id} value={p.id}>{p.code} · {p.name}</MenuItem>
          ))}
        </TextField>
        <Button type="submit" disabled={busy || !projectId}>
          Attach
        </Button>
      </Box>
      <Typography color="text.secondary" sx={{ fontSize: 11, mt: 2 }}>
        Removing a member or detaching a project asks for confirmation and keeps the tasks already assigned.
      </Typography>
    </>
  );
}

/** Inline confirmation shown under the list the removal came from. */
function ConfirmBox({ text, busy, onConfirm, onCancel }) {
  return (
    <Box role="group" aria-label="Confirm removal" sx={{ mb: 1.5, p: 1.75, bgcolor: '#faf0d9', color: '#88601c', borderRadius: '5px', fontSize: 12 }}>
      <Typography sx={{ fontSize: 12, mb: 1.25 }}>{text}</Typography>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button color="error" variant="contained" size="small" onClick={onConfirm} disabled={busy}>
          Confirm removal
        </Button>
        <Button size="small" onClick={onCancel} disabled={busy} sx={{ color: 'inherit' }}>
          Cancel
        </Button>
      </Box>
    </Box>
  );
}

ConfirmBox.propTypes = {
  text: PropTypes.string.isRequired,
  busy: PropTypes.bool.isRequired,
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};

const memberShape = PropTypes.shape({ id: PropTypes.number.isRequired, name: PropTypes.string.isRequired, job_title: PropTypes.string, hours_this_week: PropTypes.number });
const projectShape = PropTypes.shape({ id: PropTypes.number.isRequired, code: PropTypes.string.isRequired, name: PropTypes.string.isRequired });
const teamShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  code: PropTypes.string,
  name: PropTypes.string.isRequired,
  members: PropTypes.arrayOf(memberShape).isRequired,
  projects: PropTypes.arrayOf(projectShape).isRequired,
  hours_this_week: PropTypes.number,
});
const optionsShape = PropTypes.shape({ job_titles: PropTypes.arrayOf(PropTypes.string), projects: PropTypes.arrayOf(projectShape) });

TeamPanel.propTypes = {
  mode: PropTypes.oneOf(['create', 'assign', 'manage']),
  team: teamShape,
  teams: PropTypes.arrayOf(teamShape).isRequired,
  options: optionsShape,
  onClose: PropTypes.func.isRequired,
};
CreateTeamForm.propTypes = { options: optionsShape, onDone: PropTypes.func.isRequired };
AssignForm.propTypes = { teams: PropTypes.arrayOf(teamShape).isRequired, options: optionsShape, onDone: PropTypes.func.isRequired };
ManageTeam.propTypes = { team: teamShape.isRequired, options: optionsShape };
