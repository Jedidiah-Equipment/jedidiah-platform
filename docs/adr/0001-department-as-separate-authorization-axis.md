# Department Membership as a Separate Authorization Axis from AppRole

Stage-level access on Jobs (Procurement, Fabrication, Paint, Assembly, Dispatch) is governed by Department membership — a second, orthogonal authorization axis alongside the existing `AppRole` system. `AppRole` continues to govern feature access (product management, user management, audit); Department membership governs which stage of which Jobs a user can see and edit. Cross-cutting Job permissions (`job-viewer`, `job-supervisor`) cover non-departmental roles like sales and planners.

## Considered Options

- **New flat roles per department + per-stage permission strings** (e.g. `procurement` role with `job-stage.procurement:*` permissions). Rejected: would have multiplied the flat permission space by stage count and conflated feature access with org-structure facts.
- **A two-dimensional permission shape** (`{ resource, action, stage }`). Rejected: would have introduced a second permission shape into a codebase that uses flat strings consistently elsewhere.

## Consequences

- Authorization checks for stage access consult a different code path than `hasPermission()`. The check is roughly: *"user is a member of the stage's owning department OR holds a cross-cutting Job permission OR is admin"*.
- Users gain a `department_memberships` collection (junction table or JSON column) independent of their `AppRole`.
- Multi-department membership is supported natively (supervisors, cross-trained staff).
- The decision intentionally keeps the existing flat-permission system untouched — it is the right shape for feature access; it is not the right shape for org-membership facts.
