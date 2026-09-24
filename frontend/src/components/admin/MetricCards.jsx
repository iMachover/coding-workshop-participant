import PropTypes from 'prop-types'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Skeleton from '@mui/material/Skeleton'

import { brand } from '../../theme'
import { METRIC_CARDS, metricCount } from '../../utils/adminMetrics'
import ErrorState from '../ErrorState'

/** A colored dot in front of a card's label; decoration only. */
function Dot({ color }) {
  return <Box component="span" aria-hidden="true" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flex: 'none' }} />
}

Dot.propTypes = { color: PropTypes.string.isRequired }

/**
 * The dashboard's headline counts as a compact strip: six across on larger screens, 3×2
 * on phones. Each card is a toggle: choosing it shows exactly those tickets in All
 * tickets (see METRIC_CARDS); choosing it again clears it. "Active" just goes back to
 * the default view, so it is never shown as pressed.
 */
function MetricCards({ metrics, selected, onSelect }) {
  if (metrics.error) return <ErrorState message={metrics.error.message} onRetry={metrics.reload} />
  if (!metrics.data) return <Skeleton variant="rounded" height={66} aria-label="Loading the numbers" />

  return (
    <Box
      component="ul"
      aria-label="Tickets in numbers"
      sx={{
        listStyle: 'none',
        m: 0,
        p: 0,
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(3, minmax(0, 1fr))', md: 'repeat(6, minmax(0, 1fr))' },
        gap: { xs: 1, sm: 1.5 },
      }}
    >
      {METRIC_CARDS.map(({ key, label, sub, dot, filters }) => {
        const count = metricCount(key, metrics.data)
        const pressed = selected === key
        const action = filters ? `${pressed ? 'Showing' : 'Show'} these tickets` : 'Show all active tickets'
        return (
          <Box component="li" key={key} sx={{ minWidth: 0 }}>
            <ButtonBase
              aria-pressed={filters ? pressed : undefined}
              aria-label={`${label}: ${count}. ${action}`}
              onClick={() => onSelect(key)}
              sx={{
                width: '100%',
                height: '100%',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 0.25,
                px: { xs: 1.25, sm: 1.75 },
                py: { xs: 1, sm: 1.25 },
                borderRadius: 2,
                textAlign: 'left',
                bgcolor: pressed ? '#F0F7FC' : 'background.paper',
                // The inset shadow draws the 2px "pressed" border without shifting the content.
                border: 1,
                borderColor: pressed ? 'primary.main' : 'divider',
                boxShadow: pressed ? `inset 0 0 0 1px ${brand.blue}` : 'none',
                '&:hover': { boxShadow: pressed ? `inset 0 0 0 1px ${brand.blue}` : '0 1px 4px rgba(0,59,112,.15)' },
                '&.Mui-focusVisible': { outline: `2px solid ${brand.blue}`, outlineOffset: 2 },
              }}
            >
              <Box
                component="span"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                  fontSize: 12,
                  fontWeight: 500,
                  color: 'text.secondary',
                  order: { xs: 2, sm: 0 },
                  whiteSpace: 'nowrap',
                }}
              >
                <Dot color={dot} />
                {label}
              </Box>
              <Box component="span" sx={{ display: 'flex', alignItems: 'baseline', gap: 1, minWidth: 0 }}>
                <Box component="span" sx={{ fontSize: { xs: 22, sm: 26 }, fontWeight: 600, lineHeight: 1.1, color: 'secondary.main' }}>
                  {count}
                </Box>
                <Box
                  component="span"
                  sx={{
                    display: { xs: 'none', sm: 'inline' },
                    fontSize: 12,
                    color: 'text.secondary',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {sub}
                </Box>
              </Box>
            </ButtonBase>
          </Box>
        )
      })}
    </Box>
  )
}

MetricCards.propTypes = {
  metrics: PropTypes.shape({
    data: PropTypes.objectOf(PropTypes.number),
    error: PropTypes.instanceOf(Error),
    reload: PropTypes.func.isRequired,
  }).isRequired,
  selected: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
}

export default MetricCards
