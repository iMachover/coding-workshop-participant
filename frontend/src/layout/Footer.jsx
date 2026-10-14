import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LockOutlined from '@mui/icons-material/LockOutlined';
import { useAuth } from '../context/useAuth';

/** What each role can see, stated under every page (prototype `.acme-footer`). */
const SCOPE_BY_ROLE = {
  admin: 'Organization-wide visibility',
  manager: 'Your projects and direct reports only',
  employee: 'Only your assigned work and personal data',
};

/**
 * Page footer: the signed-in role's visibility scope on the left, currency note on the right.
 */
export function Footer() {
  const { user } = useAuth();

  return (
    <Box
      component="footer"
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: 2,
        pt: { xs: 2, lg: 1.625 },
        color: '#7b8b7d',
      }}
    >
      <Typography sx={{ fontSize: { xs: 9, sm: 10 }, display: 'inline-flex', alignItems: 'center', gap: 0.625 }}>
        <LockOutlined sx={{ fontSize: 11 }} />
        {SCOPE_BY_ROLE[user.role]}
      </Typography>
      <Typography sx={{ fontSize: { xs: 9, sm: 10 } }}>ACME workspace · All amounts USD</Typography>
    </Box>
  );
}
