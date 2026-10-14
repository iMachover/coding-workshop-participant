import DashboardOutlined from '@mui/icons-material/DashboardOutlined';
import FolderOutlined from '@mui/icons-material/FolderOutlined';
import GroupOutlined from '@mui/icons-material/GroupOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import ManageAccountsOutlined from '@mui/icons-material/ManageAccountsOutlined';
import ShowChartOutlined from '@mui/icons-material/ShowChartOutlined';
import TuneOutlined from '@mui/icons-material/TuneOutlined';

/**
 * Sidebar pages per role, in mockup order (EMPLOYEE.md §6, MANAGER.md §6, ADMIN.md §6).
 * This is also the route allow-list: a role can open exactly the paths listed here.
 * Hiding a page is only convenience; the API enforces the same roles on every endpoint.
 *
 * `doc` points at the spec for the page until it is built.
 */
export const NAV_BY_ROLE = {
  employee: [
    { path: '/', label: 'Overview', icon: DashboardOutlined, doc: 'EMPLOYEE.md §6.2' },
    { path: '/projects', label: 'My projects', icon: FolderOutlined, doc: 'EMPLOYEE.md §6.3' },
    { path: '/teams', label: 'My teams', icon: GroupOutlined, doc: 'EMPLOYEE.md §6.4' },
    { path: '/hours', label: 'My hours', icon: ShowChartOutlined, doc: 'EMPLOYEE.md §6.5' },
    { path: '/settings', label: 'Settings', icon: TuneOutlined, doc: 'EMPLOYEE.md §6.6' },
  ],
  manager: [
    { path: '/', label: 'Overview', icon: DashboardOutlined, doc: 'MANAGER.md §6.1' },
    { path: '/projects', label: 'Projects', icon: FolderOutlined, doc: 'MANAGER.md §6.2' },
    { path: '/team', label: 'My team', icon: GroupOutlined, doc: 'MANAGER.md §6.3' },
    { path: '/reports', label: 'Reports', icon: ShowChartOutlined, doc: 'MANAGER.md §6.4' },
    { path: '/settings', label: 'Settings', icon: TuneOutlined, doc: 'MANAGER.md §6.5' },
  ],
  admin: [
    { path: '/', label: 'Overview', icon: DashboardOutlined, doc: 'ADMIN.md §6.1' },
    { path: '/projects', label: 'Projects', icon: FolderOutlined, doc: 'ADMIN.md §6.2' },
    { path: '/people', label: 'People & access', icon: ManageAccountsOutlined, doc: 'ADMIN.md §6.3' },
    { path: '/audit', label: 'Audit activity', icon: ShowChartOutlined, doc: 'ADMIN.md §6.4' },
    { path: '/archives', label: 'Archives', icon: Inventory2Outlined, doc: 'ADMIN.md §6.5' },
    { path: '/settings', label: 'Settings', icon: TuneOutlined, doc: 'ADMIN.md §6.6' },
  ],
};

export const ROLE_LABELS = { employee: 'Employee', manager: 'Manager', admin: 'Admin' };

/** Every path any role can open, with the roles allowed on it. */
export const ROUTE_ROLES = Object.entries(NAV_BY_ROLE).reduce((routes, [role, items]) => {
  items.forEach(({ path }) => {
    routes[path] = [...(routes[path] ?? []), role];
  });
  return routes;
}, {});

/**
 * The nav entry for a path as seen by a role, or undefined if the role cannot open it.
 * @param {string} role
 * @param {string} path
 */
export function findNavItem(role, path) {
  return NAV_BY_ROLE[role]?.find((item) => item.path === path);
}
