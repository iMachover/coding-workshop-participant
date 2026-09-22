## Ticket Details

When an employee opens a ticket, show:

- Ticket ID
- Title
- Description
- Category
- Location
- Urgency
- Affected scope
- Priority
- Current status
- Assigned engineer, when assigned
- Progress / updates
- Blocked reason, when applicable
- Last updated date

### Ticket Workflow

Display the ticket lifecycle visually:

**Open → In Progress → Blocked → Resolved → Closed**

The employee should be able to see the ticket’s current position in the workflow.

# Shared Incidents / “Happening Near Me”

## MVP

**Happening Near Me** is the employee-facing view for larger shared incidents that may affect multiple employees.

The name does not mean the incident must literally be geographically near the employee.

Facility Admins can identify clusters of related employee tickets and create a **shared incident** representing the broader underlying problem.

Related employee tickets remain separate tickets but can be linked to the shared incident.

Facility Admins can:

- Add employee tickets to a shared incident
- Remove incorrectly linked tickets
- View all tickets linked to the shared incident
- See how many tickets and employees are affected

For the MVP, admins can identify patterns using:

- Category
- Building
- Floor
- Seat
- Affected scope
- Similar timing

Example:

**Building A → Floor 3 → Network → Affects Floor → many tickets within a short period**

This may indicate that multiple employees are reporting the same network outage.

The Facility Admin can create a shared incident and link the related tickets to it.

---
