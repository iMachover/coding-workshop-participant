import PropTypes from 'prop-types';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useAuth } from '../context/useAuth';
import { ROLE_LABELS, findNavItem } from '../config/navigation';
import { PageHeader } from '../layout/PageHeader';

/**
 * Stand-in for a page that is in the sidebar but not built yet. Each one is
 * replaced by the real page in its own slice; `doc` names the spec to build from.
 *
 * @param {{ path: string }} props
 */
export function PlaceholderPage({ path }) {
  const { user } = useAuth();
  const item = findNavItem(user.role, path);

  return (
    <>
      <PageHeader
        eyebrow={`${ROLE_LABELS[user.role]} workspace`}
        title={item.label}
        subtitle={`Signed in as ${user.first_name} ${user.last_name}.`}
      />
      <Paper variant="outlined" sx={{ p: 3, maxWidth: 640 }}>
        <Typography sx={{ fontWeight: 600, mb: 0.5 }}>This page is not built yet</Typography>
        <Typography variant="body2" color="text.secondary">
          It arrives in a later slice. Spec: {item.doc}.
        </Typography>
      </Paper>
    </>
  );
}

PlaceholderPage.propTypes = {
  path: PropTypes.string.isRequired,
};
