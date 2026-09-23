import { useState } from 'react'
import PropTypes from 'prop-types'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import Link from '@mui/material/Link'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { Link as RouterLink, useNavigate } from 'react-router'

import ChoiceField from '../components/ChoiceField'
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
  short_description: '',
  description: '',
  category: '',
  urgency: '',
  affected_scope: '',
  building_id: '',
  floor_id: '',
  seat_id: '',
}

// Examples from EMPLOYEE_FLOW.md help people pick consistently.
const URGENCY_OPTIONS = [
  { value: 'low', label: 'Low', hint: "It's inconvenient, but I can still work." },
  { value: 'medium', label: 'Medium', hint: 'It stops part of my work.' },
  { value: 'high', label: 'High', hint: "I can't work at all." },
]

const SCOPE_OPTIONS = [
  { value: 'me', label: 'Just me', hint: 'my seat or workstation' },
  { value: 'floor', label: 'My floor', hint: 'others on the floor are affected' },
  { value: 'building', label: 'Building', hint: 'the whole building is affected' },
]

function Section({ title, children }) {
  return (
    <Box component="section" aria-label={title}>
      <Typography component="h2" variant="h6" sx={{ mb: 2 }}>
        {title}
      </Typography>
      <Stack spacing={2}>{children}</Stack>
    </Box>
  )
}

Section.propTypes = {
  title: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
}

/** "12/150" under a text field, or its error when there is one. */
function counted(value, limit, error) {
  return error || `${value.trim().length}/${limit}`
}

/**
 * Report a facility issue: what's wrong, how urgent, and where (Building -> Floor ->
 * Seat, as much as the affected scope needs). The API sets status and the internal
 * priority, which employees never see.
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
    <Stack spacing={3}>
      <Box>
        <Link component={RouterLink} to="/dashboard" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
          <ArrowBackIcon fontSize="small" aria-hidden="true" />
          Back to dashboard
        </Link>
        <Typography variant="h4" component="h1">
          Report an issue
        </Typography>
        <Typography color="text.secondary">
          Tell us what&apos;s wrong and where. Fields marked * are required.
        </Typography>
      </Box>

      <Card>
        <CardContent sx={{ p: { xs: 2, sm: 4 } }}>
          <form onSubmit={handleSubmit} noValidate>
            <Stack spacing={4}>
              {formError && <Alert severity="error">{formError}</Alert>}

              <Section title="What's wrong?">
                {textField('title', 'Title', {
                  helperText: counted(values.title, LIMITS.title, errors.title),
                })}
                {textField('short_description', 'Short description', {
                  helperText: counted(values.short_description, LIMITS.short_description, errors.short_description),
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
                  minRows: 4,
                  helperText: counted(values.description, LIMITS.description, errors.description),
                })}
              </Section>

              <Divider />

              <Section title="How urgent is it?">
                <ChoiceField
                  name="urgency"
                  label="Urgency"
                  options={URGENCY_OPTIONS}
                  value={values.urgency}
                  onChange={handleChoice}
                  error={errors.urgency}
                  required
                  disabled={submitting}
                />
              </Section>

              <Divider />

              <Section title="Where is it?">
                <ChoiceField
                  name="affected_scope"
                  label="Impact: who is affected?"
                  options={SCOPE_OPTIONS}
                  value={values.affected_scope}
                  onChange={handleChoice}
                  error={errors.affected_scope}
                  required
                  disabled={submitting}
                />
                <LocationPicker
                  values={values}
                  required={required}
                  errors={errors}
                  disabled={submitting}
                  onChange={update}
                />
              </Section>

              <Stack direction={{ xs: 'column-reverse', sm: 'row' }} spacing={2} sx={{ justifyContent: 'flex-end' }}>
                <Button component={RouterLink} to="/dashboard" disabled={submitting}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={submitting}
                  startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : null}
                >
                  {submitting ? 'Creating ticket…' : 'Create ticket'}
                </Button>
              </Stack>
            </Stack>
          </form>
        </CardContent>
      </Card>
    </Stack>
  )
}

export default CreateTicketPage
