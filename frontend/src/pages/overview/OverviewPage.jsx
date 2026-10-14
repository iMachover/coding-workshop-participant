import { useAuth } from '../../context/useAuth';
import { AdminOverview } from './AdminOverview';
import { EmployeeOverview } from './EmployeeOverview';
import { ManagerOverview } from './ManagerOverview';

const OVERVIEW_BY_ROLE = {
  employee: EmployeeOverview,
  manager: ManagerOverview,
  admin: AdminOverview,
};

/** The home page (/): each role gets its own Overview. */
export function OverviewPage() {
  const { user } = useAuth();
  const Overview = OVERVIEW_BY_ROLE[user.role];
  return <Overview />;
}
