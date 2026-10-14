# Claude handoff prompt

You are working in my VS Code React app. Treat the ACME prototype source in `src/components/mockups/acme/` as the design and interaction reference. Read the entire folder—including `_RoleWorkspace.tsx`, `_shared/Shell.tsx`, `_RoleWorkspace.css`, and `_group.css`—before changing it. Preserve the current visual language, responsive behavior, keyboard focus visibility, and role-specific information architecture.

This bundle is a UI prototype, not a finished full-stack application. Current actions and data are local/sample state. Do not describe local state as persisted. Integrate with the host application's existing router, auth provider, API, and database patterns where they exist; do not invent hardcoded credentials or bypass authorization. If the host app is not set up yet, first report the expected architecture and propose a staged implementation plan before making broad infrastructure changes.

If this project is JavaScript-only, convert the TSX files to `.jsx` by removing TypeScript-only annotations while preserving behavior. Keep React components and CSS (do not replace styling with Material UI). `lucide-react` is the only non-React runtime import in the prototype.

Implement the role rules from the workshop:

- Admin creates projects and users (including managers/admins), assigns one manager to each project, archives/restores projects and users, and can inspect audit history. Admins do not assign employees to teams or projects.
- Managers manage only their projects; assign employees to teams/projects; edit project dates and budgets; create dependent milestones; track individual workload against a 40-hour work week; and approve or reopen submitted task/milestone completion. Managers cannot create/delete projects or see archives.
- Employees see only projects and tasks assigned to them, can belong to multiple teams/projects, can update their own name/email, can move assigned tasks to in progress or submitted, and cannot approve their own completion. Show their personal hours and cost clearly.
- Keep milestones dependency-aware, planned-versus-actual hours/cost visible, and employee task status distinct from manager-approved completion.

Use the supplied workshop guidelines and workshop notes as the requirements source. Before implementation, inspect the host project and identify its existing stack, routes, data model, and auth. Then report a concise mapping from each prototype page to the host app and list any requirements that need clarification. Implement incrementally, keeping role authorization enforced on the server/API as well as the UI. Add persistence and tests for the real workflows; preserve these mockup files as the reference unless I explicitly ask you to replace them.
