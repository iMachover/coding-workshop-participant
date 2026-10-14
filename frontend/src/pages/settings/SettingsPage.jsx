import PropTypes from 'prop-types';
import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CheckOutlined from '@mui/icons-material/CheckOutlined';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import { useAuth } from '../../context/useAuth';
import { useToast } from '../../context/useToast';
import { ROLE_LABELS } from '../../config/navigation';
import { ROLE } from '../../config/statuses';
import { SectionCard } from '../../components/SectionCard';
import { StatusChip } from '../../components/StatusChip';
import { PageHeader } from '../../layout/PageHeader';
import { monoFont } from '../../theme';
import { updateMe } from '../../services/settingsService';
import { DepartmentsCard } from './DepartmentsCard';

const SCOPE = {
  admin: 'You manage accounts, project ownership, departments, archives and the audit trail. Employee team assignments belong to managers.',
  manager: 'You manage your projects and direct reports. Account creation, role changes, project creation and archives remain admin-only.',
  employee: 'You can open your assigned projects, update your tasks and record your own hours. Project and milestone completion need manager approval.',
};

const NOTIFICATIONS = {
  admin: ['New account and permission changes', 'Project ownership changes', 'Archive and restoration activity'],
  manager: ['Task completion requests', 'Over-capacity workload changes', 'Milestone and budget alerts'],
  employee: ['New task assignments', 'Manager approval and change requests', 'Upcoming task deadlines'],
};

/**
 * Settings (EMPLOYEE.md §6.6, MANAGER.md §6.5, ADMIN.md §6.6; prototype `RolePage page="Settings"`):
 * the person's own name and email (PATCH /me), the role badge, notification checkboxes that are
 * not saved yet, a side card on the role's scope, and for admins the Departments section.
 */
export function SettingsPage() {
  const { user, updateUser } = useAuth();
  const showToast = useToast();
  const [values, setValues] = useState({ first_name: user.first_name, last_name: user.last_name, email: user.email });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [notify, setNotify] = useState(() => Object.fromEntries(NOTIFICATIONS[user.role].map((n) => [n, true])));
  const set = (field) => (event) => setValues((v) => ({ ...v, [field]: event.target.value }));
  const changed = values.first_name !== user.first_name || values.last_name !== user.last_name || values.email !== user.email;

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    const payload = {};
    if (values.first_name !== user.first_name) payload.first_name = values.first_name;
    if (values.last_name !== user.last_name) payload.last_name = values.last_name;
    if (values.email !== user.email) payload.email = values.email;
    try {
      const me = await updateMe(payload);
      updateUser(me);
      setValues({ first_name: me.first_name, last_name: me.last_name, email: me.email });
      showToast('Profile saved');
    } catch (err) {
      setErrors(err.fields ?? { form: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow={`${ROLE_LABELS[user.role]} workspace · Settings`} title="Settings" subtitle="Your account details. Your role and permissions are set by an administrator." />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 324px' }, gap: { xs: 2, lg: 2.5 }, alignItems: 'start' }}>
        <Box sx={{ display: 'grid', gap: { xs: 2, lg: 2.5 }, minWidth: 0 }}>
          <SectionCard title="Account" subtitle="Only your name and email are editable account fields.">
            <Box component="form" onSubmit={save} sx={{ display: 'grid', gap: 2, px: 2.25, py: 2.5, maxWidth: 560 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <TextField label="First name" value={values.first_name} onChange={set('first_name')} required error={!!errors.first_name} helperText={errors.first_name} />
                <TextField label="Last name" value={values.last_name} onChange={set('last_name')} required error={!!errors.last_name} helperText={errors.last_name} />
              </Box>
              <TextField label="Email address" type="email" value={values.email} onChange={set('email')} required error={!!errors.email} helperText={errors.email} />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
                <StatusChip status={user.role} map={ROLE} />
                <Typography color="text.secondary" sx={{ fontSize: 11 }}>
                  Role is administered by your organization.
                </Typography>
                <Typography sx={{ fontFamily: monoFont, fontSize: 11, color: 'text.secondary' }}>· {user.username}</Typography>
              </Box>
              {errors.form && (
                <Typography variant="caption" color="error">
                  {errors.form}
                </Typography>
              )}
              <Box>
                <Button type="submit" variant="contained" startIcon={<CheckOutlined />} disabled={saving || !changed}>
                  {saving ? 'Saving…' : 'Save changes'}
                </Button>
              </Box>
            </Box>
          </SectionCard>

          <SectionCard title="Notifications" subtitle="Not saved yet. These preferences are shown for the workshop and have no effect." footer="Notification delivery is not part of the MVP; the choices here are not stored.">
            <Box sx={{ display: 'grid', px: 2.25, py: 1.5 }}>
              {NOTIFICATIONS[user.role].map((label) => (
                <FormControlLabel
                  key={label}
                  control={<Checkbox size="small" checked={notify[label]} onChange={(event) => setNotify((n) => ({ ...n, [label]: event.target.checked }))} />}
                  label={<Typography sx={{ fontSize: 12 }}>{label}</Typography>}
                />
              ))}
            </Box>
          </SectionCard>

          {user.role === 'admin' && <DepartmentsCard />}
        </Box>

        <SectionCard title="Your access">
          <Box sx={{ px: 2, py: 2 }}>
            <ShieldOutlined sx={{ fontSize: 18, color: '#508271' }} />
            <Typography sx={{ fontSize: 12, mt: 1 }}>{SCOPE[user.role]}</Typography>
            <Typography color="text.secondary" sx={{ fontSize: 11, mt: 1.5 }}>
              Passwords are set by an administrator when the account is created. Password changes are not self-service yet.
            </Typography>
          </Box>
        </SectionCard>
      </Box>
    </>
  );
}

SettingsPage.propTypes = {};
