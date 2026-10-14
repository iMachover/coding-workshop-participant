import { Link as RouterLink } from 'react-router-dom';
import Button from '@mui/material/Button';
import { PageHeader } from '../layout/PageHeader';

/**
 * Shown when a signed-in user opens a page their role cannot use,
 * for example an employee typing /audit into the address bar.
 */
export function ForbiddenPage() {
  return (
    <PageHeader
      eyebrow="No access"
      title="This page isn't available for your role"
      subtitle="Use the sidebar to open the pages you can work with."
      actions={
        <Button variant="contained" component={RouterLink} to="/">
          Go to overview
        </Button>
      }
    />
  );
}
