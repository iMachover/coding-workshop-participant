import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { Link as RouterLink, useNavigate } from 'react-router'

import AuthCard from '../components/AuthCard'
import { ApiError } from '../services/apiClient'
import { register } from '../services/authService'
import {
  REGISTER_FIELDS,
  validateRegisterField,
  validateRegisterForm,
} from '../utils/registerValidation'

const EMPTY_FORM = {
  full_name: '',
  email: '',
  phone_number: '',
  password: '',
  confirm_password: '',
}

const FIELD_PROPS = {
  full_name: { label: 'Full name', autoComplete: 'name', required: true },
  email: {
    label: 'Work email',
    type: 'email',
    autoComplete: 'email',
    required: true,
    hint: 'Use your @acme.inc address.',
  },
  phone_number: { label: 'Phone (optional)', type: 'tel', autoComplete: 'tel' },
  password: {
    label: 'Password',
    type: 'password',
    autoComplete: 'new-password',
    required: true,
    hint: 'At least 8 characters.',
  },
  confirm_password: {
    label: 'Confirm password',
    type: 'password',
    autoComplete: 'new-password',
    required: true,
  },
}

/**
 * Employee sign-up. Checks fields before sending, shows API errors next to the
 * matching field, and goes to sign-in with a success message when done.
 */
function RegisterPage() {
  const navigate = useNavigate()
  const [values, setValues] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleChange = (event) => {
    const { name, value } = event.target
    const next = { ...values, [name]: value }
    setValues(next)
    // Once a field shows an error, re-check it as the user fixes it.
    if (errors[name]) setErrors({ ...errors, [name]: validateRegisterField(name, next) })
  }

  const handleBlur = (event) => {
    const { name } = event.target
    // Don't nag about a field the user tabbed past without typing.
    if (values[name] || errors[name]) {
      setErrors({ ...errors, [name]: validateRegisterField(name, values) })
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setFormError('')
    const found = validateRegisterForm(values)
    setErrors(found)
    const firstInvalid = REGISTER_FIELDS.find((field) => found[field])
    if (firstInvalid) {
      document.getElementById(`register-${firstInvalid}`).focus()
      return
    }

    setSubmitting(true)
    try {
      const user = await register(values)
      navigate('/login', { state: { registeredEmail: user.email } })
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setFormError('Something went wrong. Please try again.')
      } else if (error.status === 409) {
        setErrors({ email: error.message })
      } else if (Object.keys(error.fieldErrors).some((f) => REGISTER_FIELDS.includes(f))) {
        setErrors(error.fieldErrors)
      } else {
        setFormError(error.message)
      }
      setSubmitting(false)
    }
  }

  return (
    <AuthCard title="Create your account" subtitle="Report and track facility issues at ACME.">
      <form onSubmit={handleSubmit} noValidate>
        <Stack spacing={2.5}>
          {formError && <Alert severity="error">{formError}</Alert>}

          {REGISTER_FIELDS.map((field) => {
            const { hint, ...props } = FIELD_PROPS[field]
            return (
              <TextField
                key={field}
                id={`register-${field}`}
                name={field}
                value={values[field]}
                onChange={handleChange}
                onBlur={handleBlur}
                error={Boolean(errors[field])}
                helperText={errors[field] || hint || ' '}
                disabled={submitting}
                fullWidth
                {...props}
              />
            )
          })}

          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={submitting}
            startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : null}
          >
            {submitting ? 'Creating account…' : 'Create account'}
          </Button>

          <Typography variant="body2" sx={{ textAlign: 'center' }}>
            Already have an account?{' '}
            <Link component={RouterLink} to="/login">
              Sign in
            </Link>
          </Typography>
        </Stack>
      </form>
    </AuthCard>
  )
}

export default RegisterPage
