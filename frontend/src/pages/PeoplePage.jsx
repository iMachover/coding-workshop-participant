import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import InputAdornment from '@mui/material/InputAdornment'
import LinearProgress from '@mui/material/LinearProgress'
import Skeleton from '@mui/material/Skeleton'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import SearchIcon from '@mui/icons-material/Search'

import PeopleList from '../components/admin/PeopleList'
import RoleChangeDialog from '../components/admin/RoleChangeDialog'
import ErrorState from '../components/ErrorState'
import useApiData from '../hooks/useApiData'
import useDebouncedValue from '../hooks/useDebouncedValue'
import { listUsers } from '../services/adminUserService'
import { roleLabel } from '../utils/roles'

const ROLE_FILTERS = [
  ['', 'Everyone'],
  ['employee', 'Employees'],
  ['engineer', 'Engineers'],
  ['admin', 'Admins'],
]

/**
 * Facility Admin people page: everyone with their role and active tickets, searchable
 * and filterable by role. Employees can be made engineers and back; each change is
 * confirmed first, since it signs that person out.
 */
function PeoplePage() {
  const [role, setRole] = useState('')
  const [q, setQ] = useState('')
  const search = useDebouncedValue(q.trim(), 300)
  const people = useApiData(listUsers, { role: role || undefined, q: search || undefined })
  // The change being confirmed, and a counter so each dialog starts fresh.
  const [change, setChange] = useState(null)
  const [changeCount, setChangeCount] = useState(0)
  const [notice, setNotice] = useState('')
  const users = people.data ?? []

  const requestChange = (user, newRole) => {
    setChange({ user, role: newRole })
    setChangeCount((n) => n + 1)
  }

  const handleChanged = (user) => {
    setChange(null)
    setNotice(`${user.full_name} is now ${user.role === 'engineer' ? 'an engineer' : 'an employee'}. They'll need to sign in again.`)
    people.reload()
  }

  let content
  if (people.error) {
    content = <ErrorState message={people.error.message} onRetry={people.reload} />
  } else if (!people.data) {
    content = <Skeleton variant="rounded" height={200} aria-label="Loading people" />
  } else if (users.length === 0) {
    content = (
      <Card>
        <CardContent>
          <Typography gutterBottom>No one matches these filters.</Typography>
          <Button
            size="small"
            onClick={() => {
              setRole('')
              setQ('')
            }}
          >
            Clear filters
          </Button>
        </CardContent>
      </Card>
    )
  } else {
    content = (
      <Box aria-busy={people.loading}>
        {people.loading && <LinearProgress sx={{ mb: 1 }} aria-label="Updating people" />}
        <PeopleList users={users} onRequestChange={requestChange} />
      </Box>
    )
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" component="h1">
          People
        </Typography>
        <Typography color="text.secondary">
          Make employees engineers so they can be assigned tickets, or move engineers back. {roleLabel('admin')}{' '}
          accounts can&apos;t be changed here.
        </Typography>
      </Box>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <ToggleButtonGroup
          value={role}
          exclusive
          size="small"
          aria-label="Which people"
          onChange={(_event, value) => value !== null && setRole(value)}
          sx={{ flexWrap: 'wrap' }}
        >
          {ROLE_FILTERS.map(([value, label]) => (
            <ToggleButton key={label} value={value}>
              {label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <TextField
          label="Search"
          placeholder="Name or email"
          type="search"
          size="small"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          sx={{ flexGrow: 1 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon aria-hidden="true" />
                </InputAdornment>
              ),
            },
          }}
        />
      </Stack>

      {content}

      <RoleChangeDialog key={changeCount} change={change} onClose={() => setChange(null)} onChanged={handleChanged} />

      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={6000}
        onClose={() => setNotice('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled" onClose={() => setNotice('')}>
          {notice}
        </Alert>
      </Snackbar>
    </Stack>
  )
}

export default PeoplePage
