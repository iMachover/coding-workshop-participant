import PropTypes from 'prop-types'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined'
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined'

const row = { display: 'inline-flex', alignItems: 'center', gap: 1, overflowWrap: 'anywhere' }

/** Who reported the ticket and how to reach them: email and phone open the mail or phone app. */
function RequesterContact({ name, email, phone }) {
  return (
    <Stack spacing={1}>
      <Typography fontWeight={600}>{name}</Typography>
      <Link href={`mailto:${email}`} sx={row}>
        <EmailOutlinedIcon fontSize="small" aria-hidden="true" />
        {email}
      </Link>
      {phone ? (
        <Link href={`tel:${phone.replace(/[^\d+]/g, '')}`} sx={row}>
          <PhoneOutlinedIcon fontSize="small" aria-hidden="true" />
          {phone}
        </Link>
      ) : (
        <Typography color="text.secondary" sx={row}>
          <PhoneOutlinedIcon fontSize="small" aria-hidden="true" />
          No phone number given
        </Typography>
      )}
    </Stack>
  )
}

RequesterContact.propTypes = {
  name: PropTypes.string.isRequired,
  email: PropTypes.string.isRequired,
  phone: PropTypes.string,
}

export default RequesterContact
