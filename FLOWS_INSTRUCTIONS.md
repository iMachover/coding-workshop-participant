Please review these documents before we begin:

- @WORKSHOP_GUIDELINES.md
- @WORKSHOP_NOTES.md
- @EXAMPLE_APP_TABLES_AND_FLOW.md
- @frontend/README.md
- @docs/README.md
- @docs/full-stack.md
- @docs/validation.md

Use the workshop guidelines as the source of truth for requirements, the workshop notes for our development methodology, and the example application as a reference.

## Our Goal

I want to build this application using vertical slices, implementing one complete user flow at a time across the database, backend, API, and frontend.

We will start with the Employee MVP, which we will document in @EMPLOYEE.md.

For now, we are only brainstorming and designing. Do not implement anything yet.

## Step 1: Brainstorm the Employee MVP

Help me determine the bare minimum functionality an employee needs to accomplish the business requirements.

Let's work through these in order:

- User Flows: What does the employee need to accomplish? Define the minimum end-to-end workflows.
- Core Actions: What actions must the employee perform for each workflow?
- Data Requirements: What information must be stored, retrieved, or updated for these actions?
- Database Tables: Design only the tables, fields, and relationships necessary to support these actions. Reuse shared tables where appropriate.
- Frontend Pages: Identify the minimum pages, forms, and dashboard elements needed for these workflows.
- API Requirements: Identify the endpoints required to connect these actions to the backend.

Let's brainstorm and agree on each part before moving to the next.

## Step 2: Handle Dependencies Between Roles

Some employee workflows may depend on actions performed by engineers or administrators.

Do not let these dependencies block us.

If the Employee MVP requires data belonging to another role:

- Identify the dependency and explain it.
- Create a plan for the minimum shared database structures needed to support it.
- Use seeded data temporarily when appropriate.

We will expand those tables and replace temporary data or behavior as we implement the other roles.

Do not implement entire engineer or admin workflows just to support the employee MVP.

Our database schema should evolve incrementally as we build each vertical slice.

## Step 3: Implementation (Only After Approval)

Once we have agreed on the Employee MVP design, we will implement one core flow at a time:

- Create or update the necessary database tables.
- Implement the necessary backend models, routes/controllers, services, and repositories.
- Build and test the API using Postman.
- Build the minimum frontend UI.
- Connect the frontend to the API.
- Test the complete flow, including authentication, authorization, and validation where applicable.
- Commit the completed slice.

We will address application setup, configuration, CORS, and other required foundational middleware before implementing the first applicable flow.

## Important Instructions

- I want to learn, not just generate an application.
- Guide me through small, manageable steps.
- Ask questions and let me participate in architectural decisions.
- Explain the reasoning behind your recommendations.
- Do not overengineer the MVP.
- Do not design functionality beyond what is necessary for the current flow.
- Draft the contents of EMPLOYEE.md in our conversation first. Only write the file after I approve it.
- After we have finalized and approved EMPLOYEE.md, including its user flows, core actions, database tables, relationships, and frontend page requirements, move on to MANAGER.md and then ADMIN.md, following the same brainstorming and approval process for each role.
- Reuse and incrementally expand shared database tables as needed. Do not begin implementation until all three roles have been planned and approved.
- Do not begin implementation until we have finalized the Employee MVP design.
- Check my understanding before moving to the next major step.
- Start by reviewing the documents and helping me brainstorm the first Employee MVP user flow. Ask me one question at a time.
