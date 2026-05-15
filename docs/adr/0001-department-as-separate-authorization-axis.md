# Job authorization: roles grant verbs, departments scope rows

Job access is governed by **two axes**: the existing flat `AppRole` enum grants verb capabilities (`job:read`, `job-stage:update`, …), and `user_department` membership scopes *which rows* a department-aware role's verbs apply to. A User with one or more Department memberships is scoped to those Departments. A User with no selected Departments is explicitly unscoped and can see every Stage their role has permission for. The Users UI must warn loudly: **If no departments are selected, the user will see ALL stages.**

## Considered Options

- **Single axis — encode departments as roles.** Rejected: would explode the role enum combinatorially as Departments grow and conflate two unrelated concerns (capability vs. scope).
- **Single axis — flat `job-editor`/`job-viewer` with no Department membership at all.** Rejected: cannot express "Paint sees only Paint Stages" (PRD US #6, #8), which is a hard requirement.
- **Two axes, with "empty department set = unscoped".** Accepted: this keeps Department membership as the only row-scope control and avoids a second role-scope matrix. The footgun is handled operationally by making the empty-selection meaning explicit in the Users UI.
- **Two axes, scope encoded as a `scope:` marker on each role.** Rejected: premature abstraction — there is currently exactly one department-scoped role; the policy module can name it directly. Revisit if a second scoped role appears.

## Consequences

- `appRoleAccess` still answers only "which verbs"; the Job Authorization Policy answers "which rows."
- Empty Department membership is not "no access." It means "all Departments" for any Stage permission the role already has.
- Any UI that edits Department membership must surface the empty-selection rule prominently before saving can surprise an operator.
