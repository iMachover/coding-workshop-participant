import PropTypes from 'prop-types'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'

import { facilityName } from '../../utils/facilities'

/** Marks a building, floor or seat employees can't pick. */
export function InactiveChip() {
  return <Chip label="Inactive" size="small" variant="outlined" />
}

/**
 * Rename (renumber), deactivate or reactivate, and delete, for one building or floor.
 * Each button's name includes the item's, e.g. "Delete Floor 3", so screen readers can
 * tell the floors' buttons apart. `onAction(type)` opens the matching dialog.
 */
function FacilityActions({ kind, item, onAction }) {
  const name = facilityName(kind, item)
  const renameVerb = kind === 'building' ? 'Rename' : 'Renumber'

  return (
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
      <Button size="small" startIcon={<EditOutlinedIcon />} aria-label={`${renameVerb} ${name}`} onClick={() => onAction('rename')}>
        {renameVerb}
      </Button>
      {item.is_active ? (
        <Button
          size="small"
          startIcon={<VisibilityOffOutlinedIcon />}
          aria-label={`Deactivate ${name}`}
          onClick={() => onAction('deactivate')}
        >
          Deactivate
        </Button>
      ) : (
        <Button
          size="small"
          startIcon={<VisibilityOutlinedIcon />}
          aria-label={`Reactivate ${name}`}
          onClick={() => onAction('reactivate')}
        >
          Reactivate
        </Button>
      )}
      <Button
        size="small"
        color="error"
        startIcon={<DeleteOutlinedIcon />}
        aria-label={`Delete ${name}`}
        onClick={() => onAction('delete')}
      >
        Delete
      </Button>
    </Stack>
  )
}

FacilityActions.propTypes = {
  kind: PropTypes.oneOf(['building', 'floor']).isRequired,
  item: PropTypes.shape({ is_active: PropTypes.bool.isRequired }).isRequired,
  onAction: PropTypes.func.isRequired,
}

export default FacilityActions
