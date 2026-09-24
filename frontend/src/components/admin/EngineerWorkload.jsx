import PropTypes from 'prop-types'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Card from '@mui/material/Card'
import LinearProgress from '@mui/material/LinearProgress'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'

import useIsMobile from '../../hooks/useIsMobile'
import { brand } from '../../theme'
import ErrorState from '../ErrorState'
import { panelHeadingSx, panelSx, visuallyHiddenSx } from './panelStyles'

/** "Kim Fixit" → "KF". */
const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')

/**
 * One engineer's load. The row is a toggle: pressed while All tickets is showing only
 * theirs. The bar compares them with the busiest engineer (the API has no capacity).
 */
function WorkloadRow({ engineer, busiest, selected, onSelect }) {
  const { full_name: name, active_count: active, open_count: open, in_progress_count: inProgress } = engineer
  return (
    <Box component="li">
      <ButtonBase
        aria-pressed={selected}
        aria-label={`${name}: ${active} active. ${selected ? 'Showing' : 'Show'} their tickets`}
        onClick={() => onSelect(engineer.user_id)}
        sx={{
          width: '100%',
          display: 'grid',
          // Phones get bigger rows (56px) and type, as in the mockup.
          gridTemplateColumns: { xs: '32px minmax(0, 1fr) 64px 24px', sm: '28px minmax(0, 1fr) 72px 24px' },
          alignItems: 'center',
          columnGap: 1.25,
          px: { xs: 1.5, sm: 2 },
          py: 0.75,
          minHeight: { xs: 56, sm: 0 },
          borderBottom: { xs: 1, sm: 0 },
          borderColor: 'divider',
          textAlign: 'left',
          fontSize: { xs: 14, sm: 13 },
          bgcolor: selected ? '#F0F7FC' : 'transparent',
          boxShadow: selected ? `inset 3px 0 0 ${brand.blue}` : 'none',
          '&:hover': { bgcolor: '#F0F7FC' },
          '&.Mui-focusVisible': { outline: `2px solid ${brand.blue}`, outlineOffset: -2 },
        }}
      >
        <Avatar aria-hidden="true" sx={{ width: { xs: 32, sm: 28 }, height: { xs: 32, sm: 28 }, fontSize: { xs: 12, sm: 11 }, fontWeight: 600, bgcolor: '#E6F0F8', color: 'secondary.main' }}>
          {initials(name)}
        </Avatar>
        <Box component="span" sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
            <Box component="span" sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {name}
            </Box>
            {engineer.p1_count > 0 && (
              <Box component="span" sx={{ flex: 'none', fontSize: 11, fontWeight: 700, color: '#B3261E' }}>
                {engineer.p1_count} P1
              </Box>
            )}
          </Box>
          <Box component="span" sx={{ fontSize: { xs: 12, sm: 11 }, color: 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {open} open · {inProgress} in progress · {engineer.blocked_count} blocked
          </Box>
        </Box>
        <LinearProgress
          variant="determinate"
          value={busiest ? (active / busiest) * 100 : 0}
          aria-hidden="true"
          sx={{ height: 6, borderRadius: 3, bgcolor: '#E6EDF3' }}
        />
        <Box component="span" sx={{ textAlign: 'right', fontWeight: 600, color: 'secondary.main' }}>
          {active}
        </Box>
      </ButtonBase>
    </Box>
  )
}

const engineerShape = PropTypes.shape({
  user_id: PropTypes.number.isRequired,
  full_name: PropTypes.string.isRequired,
  active_count: PropTypes.number.isRequired,
  open_count: PropTypes.number.isRequired,
  in_progress_count: PropTypes.number.isRequired,
  blocked_count: PropTypes.number.isRequired,
  p1_count: PropTypes.number.isRequired,
})

WorkloadRow.propTypes = {
  engineer: engineerShape.isRequired,
  busiest: PropTypes.number.isRequired,
  selected: PropTypes.bool.isRequired,
  onSelect: PropTypes.func.isRequired,
}

/**
 * Every engineer's active tickets (open, in progress, blocked), lightest load first, as
 * the API sorts them. Choosing one filters All tickets to their tickets; choosing them
 * again clears it. Long lists scroll inside the panel. On phones (a tab of its own) the
 * heading is left to the tab and the page scrolls instead.
 */
function EngineerWorkload({ engineers, selectedId = null, onSelect, sx }) {
  const isMobile = useIsMobile()
  let content
  if (engineers.error) {
    content = (
      <Box sx={{ px: 2, pb: 2, pt: isMobile ? 2 : 0 }}>
        <ErrorState message={engineers.error.message} onRetry={engineers.reload} />
      </Box>
    )
  } else if (!engineers.data) {
    content = (
      <Box sx={{ px: 2, pb: 2, pt: isMobile ? 2 : 0 }}>
        <Skeleton variant="rounded" height={110} aria-label="Loading engineers" />
      </Box>
    )
  } else if (engineers.data.length === 0) {
    content = (
      <Typography sx={{ px: 2, pb: 2, pt: isMobile ? 2 : 0, fontSize: 13, color: 'text.secondary' }}>
        No engineers yet. Give someone the engineer role to start assigning.
      </Typography>
    )
  } else {
    const busiest = Math.max(...engineers.data.map((e) => e.active_count))
    content = (
      <Box component="ul" aria-label="Engineers" sx={{
          listStyle: 'none',
          m: 0,
          p: 0,
          pb: { xs: 0, sm: 1 },
          overflow: 'auto',
          maxHeight: { xs: 'none', sm: 320, lg: 'none' },
          minHeight: 0,
          '& li:last-of-type button': { borderBottom: 0 },
        }}>
        {engineers.data.map((e) => (
          <WorkloadRow key={e.user_id} engineer={e} busiest={busiest} selected={e.user_id === selectedId} onSelect={onSelect} />
        ))}
      </Box>
    )
  }

  return (
    <Card component="section" aria-labelledby="workload-title" sx={{ ...panelSx, ...sx }}>
      <Box sx={isMobile ? visuallyHiddenSx : { display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 1, px: 2, pt: 1.5, pb: 0.75, flex: 'none' }}>
        <Typography id="workload-title" component="h2" sx={panelHeadingSx}>
          Engineer workload
        </Typography>
        <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary' }}>
          Active tickets · click to filter
        </Typography>
      </Box>
      {content}
    </Card>
  )
}

EngineerWorkload.propTypes = {
  engineers: PropTypes.shape({
    data: PropTypes.arrayOf(engineerShape),
    error: PropTypes.instanceOf(Error),
    reload: PropTypes.func.isRequired,
  }).isRequired,
  selectedId: PropTypes.number,
  onSelect: PropTypes.func.isRequired,
  // Extra styles from the page, e.g. how much of the column the panel may take.
  sx: PropTypes.object,
}

export default EngineerWorkload
