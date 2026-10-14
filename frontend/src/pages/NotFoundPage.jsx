import { Link as RouterLink } from 'react-router-dom';
import Button from '@mui/material/Button';
import { PageHeader } from '../layout/PageHeader';

/** Shown inside the app shell for any address that matches no page. */
export function NotFoundPage() {
  return (
    <PageHeader
      eyebrow="Page not found"
      title="There's nothing at this address"
      subtitle="Check the link, or use the sidebar to find the page."
      actions={
        <Button variant="contained" component={RouterLink} to="/">
          Go to overview
        </Button>
      }
    />
  );
}
