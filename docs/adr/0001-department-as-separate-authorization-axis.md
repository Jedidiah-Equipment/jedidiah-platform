# Job authorization: roles grant verbs, departments scope rows

Job access is governed by **two axes**: the existing flat `AppRole` enum grants verb capabilities (`job:read`, `job-stage:update`, …), and `user_department` membership scopes *which rows* a department-scoped role's verbs apply to. Three Job-related roles cover the personas: `job-stage-editor` (department-scoped — read/write Stages of the User's Departments), `job-viewer` (cross-cutting read-only), `job-supervisor` (cross-cutting read+write + Job lifecycle). The scope rule itself is not encoded in permission strings — it lives in the **Job Authorization Policy** module in `@pkg/domain`, which combines the coarse `hasPermission` gate with the row-level Department check.

## Considered Options

- **Single axis — encode departments as roles.** Rejected: would explode the role enum combinatorially as Departments grow and conflate two unrelated concerns (capability vs. scope).
- **Single axis — flat `job-editor`/`job-viewer` with no Department membership at all.** Rejected: cannot express "Paint sees only Paint Stages" (PRD US #6, #8), which is a hard requirement.
- **Two axes, but cross-cutting access via "empty department set = unscoped".** Rejected: fewer assignments granting *more* access is a footgun.
- **Two axes, scope encoded as a `scope:` marker on each role.** Rejected: premature abstraction — there is currently exactly one department-scoped role; the policy module can name it directly. Revisit if a second scoped role appears.

## Consequences

- `appRoleAccess` entries for cross-cutting and scoped roles look *identical* in permission strings — the distinction is invisible at the role-table level. A reader has to know to look at the Job Authorization Policy for the scope rule.
- Adding a new department-scoped role in the future is a two-line change: add the role enum value + add it to the policy module's "scoped" set. Adding a new scoped *resource* (beyond `job-stage`) is a larger change.
- The `job-viewer` and `job-supervisor` roles, previously felt-as-hacks, are now first-class Cross-Cutting roles — a deliberate counterpart to the Department-Scoped `job-stage-editor`, not a workaround.
