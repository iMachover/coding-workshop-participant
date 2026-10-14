import PropTypes from 'prop-types';
import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddOutlined from '@mui/icons-material/AddOutlined';
import { useRefresh } from '../../context/useRefresh';
import { useToast } from '../../context/useToast';
import { useApiGet } from '../../hooks/useApiGet';
import { EmptyState } from '../../components/EmptyState';
import { LoadState } from '../../components/LoadState';
import { SectionCard } from '../../components/SectionCard';
import { monoFont } from '../../theme';
import { createDepartment, updateDepartment } from '../../services/settingsService';

/**
 * Departments (ADMIN.md §6.6): list, create and rename. The prefix goes into new project
 * codes (INF-025); existing codes keep theirs. Create and rename only; no delete.
 */
export function DepartmentsCard() {
  const { data, error, retry } = useApiGet('/departments');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);

  return (
    <SectionCard
      title="Departments"
      count={data?.length}
      subtitle="Each project code starts with its department's prefix. Create and rename only."
      action={
        !adding && (
          <Button size="small" startIcon={<AddOutlined />} onClick={() => setAdding(true)}>
            New department
          </Button>
        )
      }
    >
      {!data && <LoadState error={error} onRetry={retry} />}
      {adding && <DepartmentForm onDone={() => setAdding(false)} />}
      {data && data.length === 0 && !adding && <EmptyState text="No departments yet. Create one before creating projects." />}
      {data && data.length > 0 && (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Department</TableCell>
                <TableCell>Prefix</TableCell>
                <TableCell>Next code</TableCell>
                <TableCell>People</TableCell>
                <TableCell>Active projects</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((d) =>
                editing === d.id ? (
                  <TableRow key={d.id}>
                    <TableCell colSpan={6} sx={{ p: 0 }}>
                      <DepartmentForm department={d} onDone={() => setEditing(null)} />
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={d.id} hover>
                    <TableCell sx={{ fontSize: 12, fontWeight: 600, color: '#294c49' }}>{d.name}</TableCell>
                    <TableCell sx={{ fontFamily: monoFont, fontSize: 11 }}>{d.prefix}</TableCell>
                    <TableCell sx={{ fontFamily: monoFont, fontSize: 11 }}>
                      {d.prefix}-{String(d.next_project_seq).padStart(3, '0')}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12 }}>{d.people}</TableCell>
                    <TableCell sx={{ fontSize: 12 }}>{d.active_projects}</TableCell>
                    <TableCell align="right">
                      <Button variant="text" size="small" onClick={() => setEditing(d.id)}>
                        Rename
                      </Button>
                    </TableCell>
                  </TableRow>
                ),
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </SectionCard>
  );
}

/** Create a department, or rename one and change its prefix. */
function DepartmentForm({ department, onDone }) {
  const { bump } = useRefresh();
  const showToast = useToast();
  const [values, setValues] = useState({ name: department?.name ?? '', prefix: department?.prefix ?? '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (field) => (event) => setValues((v) => ({ ...v, [field]: field === 'prefix' ? event.target.value.toUpperCase() : event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      if (department) {
        const payload = {};
        if (values.name !== department.name) payload.name = values.name;
        if (values.prefix !== department.prefix) payload.prefix = values.prefix;
        await updateDepartment(department.id, payload);
        showToast(`Department ${values.name} saved`);
      } else {
        const saved = await createDepartment(values);
        showToast(`Department ${saved.name} (${saved.prefix}) created`);
      }
      bump();
      onDone();
    } catch (err) {
      setErrors(err.fields ?? { form: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 1.5, px: 2.25, py: 2, bgcolor: '#f3f6ed' }}>
      <TextField size="small" label="Department name" value={values.name} onChange={set('name')} required error={!!errors.name} helperText={errors.name} sx={{ flexGrow: 1, minWidth: 200 }} />
      <TextField size="small" label="Prefix" value={values.prefix} onChange={set('prefix')} required slotProps={{ htmlInput: { minLength: 3, maxLength: 3, pattern: '[A-Za-z]{3}', style: { textTransform: 'uppercase' } } }} error={!!errors.prefix} helperText={errors.prefix ?? 'Three letters'} sx={{ width: 120 }} />
      <Button type="submit" variant="contained" size="small" disabled={saving} sx={{ mt: 0.5 }}>
        {department ? 'Save' : 'Create'}
      </Button>
      <Button type="button" size="small" onClick={onDone} disabled={saving} sx={{ mt: 0.5 }}>
        Cancel
      </Button>
      {errors.form && (
        <Typography variant="caption" color="error" sx={{ width: '100%' }}>
          {errors.form}
        </Typography>
      )}
    </Box>
  );
}

DepartmentForm.propTypes = {
  department: PropTypes.shape({ id: PropTypes.number.isRequired, name: PropTypes.string, prefix: PropTypes.string }),
  onDone: PropTypes.func.isRequired,
};
