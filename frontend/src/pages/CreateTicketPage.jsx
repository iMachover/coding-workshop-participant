import { useState } from 'react'
import PropTypes from 'prop-types'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CircularProgress from '@mui/material/CircularProgress'
import FormHelperText from '@mui/material/FormHelperText'
import Link from '@mui/material/Link'
import MenuItem from '@mui/material/MenuItem'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { ThemeProvider } from '@mui/material/styles'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { Link as RouterLink, useNavigate } from 'react-router'

import LocationPicker from '../components/tickets/LocationPicker'
import { ApiError } from '../services/apiClient'
import { createTicket } from '../services/ticketService'
import { CATEGORIES } from '../utils/ticketFormat'
import {
  LIMITS,
  requiredLocation,
  TICKET_FIELDS,
  validateTicketField,
  validateTicketForm,
} from '../utils/ticketValidation'

const EMPTY_FORM = {
  title: '',
  description: '',
  category: '',
  affected_scope: '',
  building_id: '',
  floor_id: '',
  seat_id: '',
}

const SCOPE_OPTIONS = [
  { value: 'me', label: 'Just me', hint: 'My seat or workstation' },
  { value: 'floor', label: 'My floor', hint: 'Others on the floor are affected' },
  { value: 'building', label: 'Building', hint: 'The whole building is affected' },
]

const LOCATION_HINTS = {
  '': 'Pick who is affected to see which location details we need.',
  me: 'Just you: pick building, floor and seat.',
  floor: 'Your floor: building and floor are enough.',
  building: 'Whole building: only the building is needed.',
}

// Hidden on screen, still read by screen readers.
const visuallyHidden = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
}

// Header (48px) plus the page's top and bottom padding (16px each) on desktop.
const DESKTOP_FIT = 'calc(100dvh - 80px)'

/** Every text field and dropdown on this page (including LocationPicker's) uses the dense size. */
const denseFields = (outer) => ({
  ...outer,
  components: { ...outer.components, MuiTextField: { defaultProps: { size: 'small' } } },
})

/** "12/150" under a text field, or its error when there is one. */
function counted(value, limit, error) {
  return error || `${value.trim().length}/${limit}`
}

/**
 * A numbered form section with a small navy heading ("2 · Where is it? *"). The region
 * is named by the title alone, so screen readers don't read out the number and asterisk.
 */
function Section({ number, title, required, children, sx }) {
  return (
    <Box component="section" aria-label={title} sx={{ display: 'flex', flexDirection: 'column', ...sx }}>
      <Typography component="h2" sx={{ fontSize: 16, fontWeight: 600, color: 'primary.dark', mb: 2 }}>
        {number} · {title}
        {required && ' *'}
      </Typography>
      {children}
    </Box>
  )
}

Section.propTypes = {
  number: PropTypes.number.isRequired,
  title: PropTypes.string.isRequired,
  required: PropTypes.bool,
  children: PropTypes.node.isRequired,
  sx: PropTypes.object,
}

/**
 * Radio options drawn as selectable cards (label plus a one-line hint), in a row of three.
 * Still a real radio group, so keyboard and screen reader behave as usual.
 */
function ChoiceCards({ name, label, options, value, onChange, error, disabled }) {
  return (
    <Box component="fieldset" disabled={disabled} sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}>
      <Box component="legend" sx={visuallyHidden}>
        {label}
      </Box>
      <RadioGroup
        name={name}
        value={value}
        onChange={(event) => onChange(name, event.target.value)}
        sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1 }}
      >
        {options.map((option) => {
          const selected = value === option.value
          return (
            <Box
              component="label"
              key={option.value}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 0.5,
                p: '10px 12px',
                borderRadius: 2,
                border: '1px solid',
                borderColor: selected ? 'primary.main' : error ? 'error.main' : 'rgba(0, 0, 0, 0.23)',
                boxShadow: selected ? (theme) => `inset 0 0 0 1px ${theme.palette.primary.main}` : 'none',
                bgcolor: selected ? '#F0F7FC' : 'background.paper',
                cursor: disabled ? 'default' : 'pointer',
                opacity: disabled ? 0.6 : 1,
                '&:hover': { borderColor: disabled || selected ? undefined : 'text.primary' },
                '&:has(input:focus-visible)': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
              }}
            >
              <Box
                component="span"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                  fontSize: 14,
                  fontWeight: 600,
                  color: selected ? 'primary.main' : 'text.primary',
                }}
              >
                <Radio value={option.value} size="small" disabled={disabled} sx={{ p: 0 }} />
                {option.label}
              </Box>
              <Box component="span" sx={{ fontSize: 12, lineHeight: 1.35, color: 'text.secondary' }}>
                {option.hint}
              </Box>
            </Box>
          )
        })}
      </RadioGroup>
      {error && <FormHelperText error>{error}</FormHelperText>}
    </Box>
  )
}

ChoiceCards.propTypes = {
  name: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  options: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      hint: PropTypes.string.isRequired,
    }),
  ).isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  error: PropTypes.string,
  disabled: PropTypes.bool,
}

/**
 * Report a facility issue: what's wrong and where (Building -> Floor -> Seat, as much
 * as the affected scope needs). The API sets status and the internal priority, which
 * employees never see. On desktop the whole form fits the window without scrolling:
 * two columns, with the full description growing to fill the left one.
 */
function CreateTicketPage() {
  const navigate = useNavigate()
  const [values, setValues] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const required = requiredLocation(values.affected_scope)

  /** Apply changes; re-check any field already showing an error (scope affects floor/seat). */
  const update = (changes) => {
    const next = { ...values, ...changes }
    setValues(next)
    const rechecked = {}
    for (const field of Object.keys(errors)) {
      if (errors[field]) rechecked[field] = validateTicketField(field, next)
    }
    setErrors({ ...errors, ...rechecked })
  }

  const handleText = (event) => update({ [event.target.name]: event.target.value })
  const handleChoice = (name, value) => update({ [name]: value })

  const handleBlur = (event) => {
    const { name } = event.target
    if (values[name]) setErrors({ ...errors, [name]: validateTicketField(name, values) })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setFormError('')
    const found = validateTicketForm(values)
    setErrors(found)
    const firstInvalid = TICKET_FIELDS.find((field) => found[field])
    if (firstInvalid) {
      const target =
        document.getElementById(`ticket-${firstInvalid}`) ??
        document.querySelector(`input[name="${firstInvalid}"]`)
      target.focus()
      return
    }

    setSubmitting(true)
    try {
      const ticket = await createTicket(values)
      navigate(`/tickets/${ticket.ticket_id}`, { state: { createdTicket: true } })
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setFormError('Something went wrong. Please try again.')
      } else if (Object.keys(error.fieldErrors).some((f) => TICKET_FIELDS.includes(f))) {
        setErrors(error.fieldErrors)
        setFormError('Please fix the highlighted fields.')
      } else {
        // e.g. 400 "Floor 4 is not in building 1" if locations changed meanwhile.
        setFormError(error.message)
      }
      setSubmitting(false)
    }
  }

  const textField = (name, label, props = {}) => (
    <TextField
      id={`ticket-${name}`}
      name={name}
      label={label}
      value={values[name]}
      onChange={handleText}
      onBlur={handleBlur}
      error={Boolean(errors[name])}
      disabled={submitting}
      required
      fullWidth
      {...props}
    />
  )

  return (
    <ThemeProvider theme={denseFields}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          height: { md: DESKTOP_FIT },
          minHeight: { md: 600 },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { sm: 'flex-end' },
            gap: { xs: 0.5, sm: 2 },
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, flex: 'none' }}>
            <Link
              component={RouterLink}
              to="/dashboard"
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 13, fontWeight: 500 }}
            >
              <ArrowBackIcon sx={{ fontSize: 18 }} aria-hidden="true" />
              Back to dashboard
            </Link>
            <Typography variant="h4" component="h1" sx={{ fontSize: 22, whiteSpace: 'nowrap' }}>
              Report an issue
            </Typography>
          </Box>
          <Typography sx={{ fontSize: 13, color: 'text.secondary', pb: { sm: '3px' } }}>
            Tell us what&apos;s wrong and where. Fields marked * are required.
          </Typography>
        </Box>

        <Card
          component="form"
          onSubmit={handleSubmit}
          noValidate
          sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
        >
          {formError && (
            <Alert severity="error" sx={{ mx: 3, mt: 2 }}>
              {formError}
            </Alert>
          )}

          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
            }}
          >
            <Section
              number={1}
              title="What's wrong?"
              sx={{
                p: { xs: 2, sm: '20px 24px' },
                minHeight: 0,
                gap: 1.5,
                borderRight: { md: '1px solid rgba(0, 0, 0, 0.08)' },
                borderBottom: { xs: '1px solid rgba(0, 0, 0, 0.08)', md: 'none' },
                '& > h2': { mb: 1 },
              }}
            >
              {textField('title', 'Title', {
                helperText: counted(values.title, LIMITS.title, errors.title),
              })}
              {textField('category', 'Category', {
                select: true,
                helperText: errors.category || ' ',
                onChange: (event) => handleChoice('category', event.target.value),
                onBlur: undefined,
                children: Object.entries(CATEGORIES).map(([code, label]) => (
                  <MenuItem key={code} value={code}>
                    {label}
                  </MenuItem>
                )),
              })}
              {textField('description', 'Full description', {
                multiline: true,
                minRows: 5,
                helperText: counted(values.description, LIMITS.description, errors.description),
                // On desktop the description grows to fill the rest of the column.
                sx: {
                  flex: { md: 1 },
                  minHeight: { md: 0 },
                  '& .MuiInputBase-root': { flex: { md: 1 }, minHeight: { md: 120 }, alignItems: 'flex-start' },
                  '& textarea': { height: { md: '100% !important' }, overflow: 'auto !important' },
                },
              })}
            </Section>

            <Section number={2} title="Where is it?" required sx={{ p: { xs: 2, sm: '20px 24px' }, gap: 1.5, '& > h2': { mb: 0.5 } }}>
              <ChoiceCards
                name="affected_scope"
                label="Who is affected?"
                options={SCOPE_OPTIONS}
                value={values.affected_scope}
                onChange={handleChoice}
                error={errors.affected_scope}
                disabled={submitting}
              />
              <Box sx={{ pt: 1 }}>
                <LocationPicker
                  values={values}
                  required={required}
                  errors={errors}
                  disabled={submitting}
                  onChange={update}
                />
              </Box>
              <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                {LOCATION_HINTS[values.affected_scope]}
              </Typography>
            </Section>
          </Box>

          <Box
            sx={{
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 1,
              px: { xs: 2, sm: 3 },
              py: 1.5,
              borderTop: '1px solid rgba(0, 0, 0, 0.12)',
              bgcolor: 'background.paper',
              // On a phone the actions stay pinned to the bottom of the screen.
              position: { xs: 'sticky', md: 'static' },
              bottom: 0,
            }}
          >
            <Typography
              sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 0.75, fontSize: 12, color: 'text.secondary' }}
            >
              <InfoOutlinedIcon sx={{ fontSize: 16 }} aria-hidden="true" />
              You can follow its progress from your dashboard.
            </Typography>
            <Button
              component={RouterLink}
              to="/dashboard"
              disabled={submitting}
              sx={{ ml: 'auto', height: 40, px: 2, fontSize: 14 }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={submitting}
              startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : null}
              sx={{ height: 42, px: '22px', fontSize: 15, '&:hover': { bgcolor: 'primary.dark' } }}
            >
              {submitting ? 'Creating ticket…' : 'Create ticket'}
            </Button>
          </Box>
        </Card>
      </Box>
    </ThemeProvider>
  )
}

export default CreateTicketPage
