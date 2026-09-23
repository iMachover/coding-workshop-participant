import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import LinearProgress from '@mui/material/LinearProgress'
import Skeleton from '@mui/material/Skeleton'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'

import BuildingDetails from '../components/admin/BuildingDetails'
import BuildingList from '../components/admin/BuildingList'
import FacilityConfirmDialog from '../components/admin/FacilityConfirmDialog'
import FacilityNameDialog from '../components/admin/FacilityNameDialog'
import ErrorState from '../components/ErrorState'
import useApiData from '../hooks/useApiData'
import useIsMobile from '../hooks/useIsMobile'
import { getFacilities } from '../services/adminFacilityService'
import { facilityName } from '../utils/facilities'

// What a new floor or seat is added to.
const PARENT_KIND = { building: undefined, floor: 'building', seat: 'floor' }

/** The message shown once an action succeeds. `item` is the saved item (null after a delete). */
function successMessage({ type, kind, item: before, parent, parentKind }, item) {
  const name = facilityName(kind, item ?? before)
  if (type === 'add') return parent ? `Added ${name} to ${facilityName(parentKind, parent)}.` : `Added ${name}.`
  if (type === 'rename') return `Saved as ${name}.`
  if (type === 'deactivate') return `${name} is inactive. Employees can't pick it for new tickets.`
  if (type === 'reactivate') return `${name} is active again.`
  return `Deleted ${name}.`
}

/**
 * Facility Admin facilities page: the buildings, floors and seats employees pick from
 * when they report an issue. Choose a building (a list on larger screens, a dropdown on
 * phones) to see its floors and their seats. Everything can be added, renamed,
 * deactivated or reactivated, and deleted if nothing has used it yet; each change goes
 * through a dialog, then the tree reloads.
 */
function FacilitiesPage() {
  const isMobile = useIsMobile()
  const facilities = useApiData(getFacilities)
  const [selectedId, setSelectedId] = useState(null)
  // The open dialog, and a counter so each one starts fresh.
  const [action, setAction] = useState(null)
  const [actionCount, setActionCount] = useState(0)
  const [notice, setNotice] = useState('')
  const buildings = facilities.data ?? []
  // A deleted (or not yet chosen) building falls back to the first one.
  const building = buildings.find((b) => b.building_id === selectedId) ?? buildings[0]

  const openAction = (type, kind, item = null, parent = null) => {
    setAction({ type, kind, item, parent, parentKind: PARENT_KIND[kind] })
    setActionCount((n) => n + 1)
  }

  const handleDone = (item) => {
    if (action.type === 'add' && action.kind === 'building') setSelectedId(item.building_id)
    setNotice(successMessage(action, item))
    setAction(null)
    facilities.reload()
  }

  let content
  if (facilities.error) {
    content = <ErrorState message={facilities.error.message} onRetry={facilities.reload} />
  } else if (!facilities.data) {
    content = <Skeleton variant="rounded" height={320} aria-label="Loading facilities" />
  } else if (!building) {
    content = (
      <Card>
        <CardContent>
          <Typography>No buildings yet. Add the first one to start.</Typography>
        </CardContent>
      </Card>
    )
  } else {
    content = (
      <Box aria-busy={facilities.loading}>
        {facilities.loading && <LinearProgress sx={{ mb: 1 }} aria-label="Updating facilities" />}
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '280px minmax(0, 1fr)' },
            alignItems: 'start',
          }}
        >
          <BuildingList
            buildings={buildings}
            selectedId={building.building_id}
            onSelect={setSelectedId}
            compact={isMobile}
          />
          <BuildingDetails key={building.building_id} building={building} onAction={openAction} />
        </Box>
      </Box>
    )
  }

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { sm: 'flex-start' } }}>
        <Box>
          <Typography variant="h4" component="h1">
            Facilities
          </Typography>
          <Typography color="text.secondary">
            The buildings, floors and seats employees choose from when they report an issue. Deactivate a location to
            stop new tickets there; tickets already there keep it.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => openAction('add', 'building')}
          sx={{ flexShrink: 0, alignSelf: { xs: 'flex-start', sm: 'auto' } }}
        >
          Add building
        </Button>
      </Stack>

      {content}

      {action && ['add', 'rename'].includes(action.type) && (
        <FacilityNameDialog key={actionCount} action={action} onClose={() => setAction(null)} onSaved={handleDone} />
      )}
      {action && ['deactivate', 'reactivate', 'delete'].includes(action.type) && (
        <FacilityConfirmDialog
          key={actionCount}
          action={action}
          onClose={() => setAction(null)}
          onDone={handleDone}
          onDeactivateInstead={() => openAction('deactivate', action.kind, action.item, action.parent)}
        />
      )}

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

export default FacilitiesPage
