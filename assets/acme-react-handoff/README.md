# ACME role-based React UI handoff

This source-only bundle contains the ACME role dashboards and supporting pages from the Replit mockup prototype. It does not include the Vite preview harness, backend, database, authentication, or production configuration.

## Source layout

- `src/components/mockups/acme/AdminDashboard.tsx` — Admin main dashboard
- `src/components/mockups/acme/ManagerDashboard.tsx` — Manager main dashboard
- `src/components/mockups/acme/EmployeeDashboard.tsx` — Employee main dashboard / My work
- `src/components/mockups/acme/AdminOverview.tsx`, `ManagerOverview.tsx` — overview pages with linked role navigation
- Other `Admin*.tsx`, `Manager*.tsx`, and `Employee*.tsx` files — supporting role page entry points
- `_RoleWorkspace.tsx` and `_shared/Shell.tsx` — shared page behavior, navigation, UI helpers, and illustrative sample data
- `_RoleWorkspace.css` and `_group.css` — shared responsive styling and theme

## Technology notes

- React components written in TypeScript JSX (`.tsx`); TypeScript annotations are present. Claude can convert these to plain JavaScript JSX (`.jsx`) if the target app is JavaScript-only.
- Styling is primarily hand-authored scoped CSS, not Material UI and not primarily Tailwind utility classes.
- Icons use `lucide-react`.
- Pages use browser-local React state and illustrative/sample data. They do not persist to a server.
- External runtime imports: `react`, `lucide-react`.

## Use

Copy the `src/components/mockups/acme` folder into the React app as needed. Keep the full folder together so relative imports and styles continue to resolve. Import a page by its named export, for example `AdminDashboard`, `ManagerDashboard`, `EmployeeDashboard`, or the corresponding supporting-page export.
