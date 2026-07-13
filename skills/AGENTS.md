# Workspace Custom Rules

## Assignment & Branching Rules

- **Squad Team Assignment Only**: All issues, sub-issues, and tasks must be assigned directly to the squad team (`@squad-dev-team`) instead of individual agent personas (e.g. `squad-product-owner`, `squad-software-architect`).
- **No Agent-Specific Branches**: Never checkout or create separate git branches for individual agent roles (e.g., `agent/<role>/<hash>`). All agents must work directly on the common task branch (e.g. `FA-<number>` or task ID) to avoid branch fragmentation and keep the repository clean.

## Task Status Transition Rules

- **No Auto-Transition to Done**: Autopilot agents (such as `squad-product-owner`, `squad-qa-reviewer`, `squad-frontend-developer`) must NEVER automatically transition ClickUp tasks or Multica issues to `done` or `completed` status. The final transition to `done` is reserved for manual sign-off by human developers or QA. Autopilots must only transition tasks to `development done` status (and keep them there assigned to Nhung Nguyen or the squad team) to allow human spot-check on staging.

