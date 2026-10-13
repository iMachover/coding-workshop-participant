This document is my personal notes and organization on what I need to create based on the WORKSHOP_GUIDELINES.md. This was made from a group Q&A with the Citi managers. It should strive to be a basis for each user and the overall project based on the WORKSHOP_GUIDELINES.md. This is to give further instructions on how the application must work, its function, and the guardrails or limitations for each user role. It should give exemplified structure to all but not limited to, each role, MVP, overall project structure, milestones, UI, project creation, and requirement definitions or further explanation and guidance for creating the application. Some parts are quick-hand notes that I will try to refine. If some notes are not clear or organized in a manner that is structural and are still quick hand notes, you should verify with me for clarification. As a rule of thumb you should be building everything step by step with the backend first and update all documentation, requirements, blockers, testing suites and fixes along the way.

## Important project folders and files:

- DOCS -> full-stack.md, README.md, validation.md
- frontend -> README.md
- Root -> WORKSHOP_GUIDELINES.md

## Project tracking system

- Stack: python/lambda
- Preferred lambda
- Can use fastAPI
- React / javascript for frontend
- Database should be postgres

## MVP: ADMIN, MANAGER, EMPLOYEE minimum requirements

- Setup project with start/end date
- Have milestones that are DEPENDENT on one another
- Manager can add employees to the project
- Admin can properly create employees, managers, and projects.
- Admin can archive projects, employees, and managers
- Tracklog of every CRUD operation for every user.
- Have it deployed to AWS

## Create a project:

- Projects get teams added that contains employees
- The logger should contain details for everything
  - Ex: Admin created a manager at 1:00pm
  - Ex: Manager created team A at 2:00pm
  - Ex: Manager assigned a,b,c to team A at 2:30
  - Ex: Manager assigned tasks for a,b,c at 2:45
- Projects track progress time
- How many hours this project has (with time assigned to employees)
- Projects can only have one manager at a time
- Projects have a start date and a predicted end date with predicted hours for each milestone and total hours for the project
- A project can only have one manager. The manager always must be in a project. No time limit on projects but must have a start and end date.

## Have 3 roles

### Admin

- Admin has full control over app / system
- Add projects, users, other admins
- CRUD
- Admins create the projects for the managers
- Admins create employees and managers
- Admins create managers
- Admins can archive projects and employees, and can retrieve the soft deleted archives
- Admins can unarchive projects
- Admins do not assign employees to teams or projects
- Admins assign managers to projects

### Manager

- Managers assign employees to teams which are assigned to projects
- Managers can assign, unassign and reassign teams to projects
- Managers can unassign or assign employees to and from multiple teams
- Managers can edit project information
- Managers have access to a list of all employees in order to assign them
- Managers cannot create projects or delete projects or see archived projects
- Managers can be assigned multiple projects and each project has at least one team assigned to it which contains a group of employees
- Managers have to be mindful of the hours about the projects so their view must be designed optimally to accommodate their needs
- Managers create and control the milestones and set the milestones
- Managers can edit who’s working on what project and what team they are on
- Managers can edit employee’s name and email only on their immediate team’s employee’s profiles
- Manager sets up when we must meet xyz goals for milestones
- Manager approves completion of milestones and when we can close the project
- Managers can adjust budget
- Managers can edit start/end dates
- Managers work 40 hour work weeks, 8 hours over 5 days

### Employee

- Employees can login
- Employees cannot create accounts
- Employees cannot promote themselves to manager
- Employees can view current project they are assigned to
- Employees cannot see projects they are not assigned to
- Employees feed only contains what is assigned to them and their statistics based on time, cost and resources
- Employees can only update their name and email on their profile
- Employees can be assigned to multiple teams and be on multiple projects
- Employees are on teams that get assigned to projects
- Employee fields: first, last, password, username (random generated 6 characters long), email, job title
- Employees can only have one manager
- Employees work 40 hour work weeks, 8 hours over 5 days
- Employee tasks should have predicted amount of hours/cost/resources with actual and somehow tracked

## Milestones:

- Projects have milestones
- Key point with deliverables, important deadlines
- Project keeps track of milestones
- Ex: On milestone 1 -> milestone 2
- Needs example milestone and example project
- Milestones have their own start and projected end dates additional to the project start and end projected date
- Ex: project to decommission 1000 servers over a year
  - Milestone 1: scope and analyze, evaluate which servers can be decommissioned now or later
  - Milestone 2: ex: we are going to decommission 200 now
  - Milestone 3: we are going to decommission 500 servers now
- Ex: server numbers will be distributed to certain employees with details like serial numbers, locations, etc.
- Employees will mark off what servers they are done with as a stretch goal
- For this MVP example we would only need to assign the servers they have been given and they can just have a done button or something like that when they are finished with their milestone
- Milestones have multiple employee tasks per project, so they will need to submit completion for each task in the milestone
- Milestones will have a total progress bar and per employee progress bars
- Total progress bar covers all employees progress towards the current milestone
- Employee progress bars cover the percentage of their completed tasks per milestone. Both employees and managers will have access to this so they can see each employee’s progress
- Milestones should can also have a notes box with on-going conversations to manager in case they need to report a problem or ask the manager a question about the specific task they are on
- Stretch: This would require an escalation workflow like notification for managers which includes directing the manager to the task at hand with the notes box to respond.
- When all milestones are complete, manager marks as done
- Milestone 1 must start before milestone 2 etc… The next milestone depends on the previous one being done.
- One milestone for many employees
- One employee for one milestone at a time

## Additional:

Project name, who’s assigned, amount of hours put into the project, budget and how much money has been spent, tracking how many hours gone into each milestone, kind of like Microsoft Project tracking with only specific details needed for this application

## Budget:

Managers set and manage the starting amount which is predicted. As employees work they get paid “X” amount of dollars, so keep track of employees' costs on the project.

Stretch goal: list other costs.

## UI:

You are free to use your best judgment when making the UI but please make everything accessible on one page. Use best UI/UX for pages, components, toast notifications, form validation, etc. Please

- Thinking timers for projects and tasks to see how long you’ve been working on it for but might be too stressful
- Limit scrolling, so everything is viewable on one page. There should be UI/UX friendly navigation dashboard. It should be very intuitive. Can have multiple components on one screen that have individual scrolling so everything is compact and easy to see and access.
- Managers should have a glance at all projects, budgets etc. in a concise view.
- Employees should see all projects they are assigned to, hours leveraged for this project and amount of $ on projects so they can talk to manager if they have any questions or issues with workload and pay
- I would like this to be a list view if possible with all the details in a nicely laid out table, and users can click on their tasks to see additional details and report progress that way, or via dropdown menu on the table, if we can fit it in there.
- Employees can update status on projects from assigned, to in progress, submitted, completed. Completed only is complete once a manager marks it as complete and they can re-open it if they need to.
- Managers should have a table of all employees they manage with some type of details for the manager to see about the employees
- This should also be the same component or similar as the employee’s table with their projects
- Managers should be able to click on employees to see more details about the employee, access to their employee profile but more importantly the projects they are assigned, their time, cost, budget used, progress, etc.
- Managers should have some basic task system.

## Scalability:

- Should be scalable
- For example: Citi has 50,000 employees

## Project management:

- Consider the: Time cost resource for each project

## Does not need:

- To be a project management system like Jira, employees do not need proof of work to say they are finished with their work and their milestone

## Admin Audit system:

- Keep track of actions in the system: log what goes on in the system of what was done by who
- For example:
  - Admin creates a new employee
  - Manager starts a new project
  - Manager adds employees to a project
