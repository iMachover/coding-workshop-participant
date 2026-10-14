import PropTypes from 'prop-types';
import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import { monoFont } from '../../theme';

/**
 * Shows a new account's generated username and temporary password once (ADMIN.md §2).
 * The password is never stored in clear, so this is the only time it can be copied.
 *
 * @param {{ credentials: { name: string, username: string, password: string } | null, onClose: () => void }} props
 */
export function CredentialsDialog({ credentials, onClose }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`Username: ${credentials.username}\nTemporary password: ${credentials.password}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog open={credentials !== null} onClose={onClose} aria-labelledby="credentials-title">
      {credentials && (
        <>
          <DialogTitle id="credentials-title">Account created for {credentials.name}</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Pass these on now. The username is shown here once; the password cannot be read back later.
            </Typography>
            <Box sx={{ display: 'grid', gap: 1.25, p: 2, bgcolor: '#f3f6ed', borderRadius: '5px' }}>
              <Credential label="Username" value={credentials.username} />
              <Credential label="Temporary password" value={credentials.password} />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button startIcon={<ContentCopyOutlined />} onClick={copy}>
              {copied ? 'Copied' : 'Copy credentials'}
            </Button>
            <Button variant="contained" onClick={onClose}>
              Done
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}

function Credential({ label, value }) {
  return (
    <Box>
      <Typography component="p" color="text.secondary" sx={{ fontSize: 10, mb: 0.375 }}>
        {label}
      </Typography>
      <Typography sx={{ fontFamily: monoFont, fontSize: 15, fontWeight: 500 }}>{value}</Typography>
    </Box>
  );
}

Credential.propTypes = { label: PropTypes.string.isRequired, value: PropTypes.string.isRequired };

CredentialsDialog.propTypes = {
  credentials: PropTypes.shape({ name: PropTypes.string, username: PropTypes.string, password: PropTypes.string }),
  onClose: PropTypes.func.isRequired,
};
