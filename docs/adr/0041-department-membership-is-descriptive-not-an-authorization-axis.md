# Department membership is descriptive, not an authorization axis

ADR-0001 (now deleted) made Department membership a second authorization axis: roles granted verbs, `user_department` rows scoped which Bays a Department-Aware role could schedule, and an empty membership set meant "unscoped — every Bay". In practice the scoping was never used, so we removed the axis entirely: **App Role alone dictates what a user can do.** `user_department` survives, but as a purely descriptive organizational fact — which part of the shop a person works in — assignable to any user regardless of role, edited under plain `user:update`, and never consulted by any authorization check.

## Consequences

- The former hard requirement "Paint schedules only Paint Bays" is formally dropped, not just unimplemented. `job:schedule` now means scheduling every Bay (Slots and Bay Calendar Exceptions); org Off-Days remain under the separate `job:update-calendar`. Only `admin` holds either, so all schedule mutation is admin-only for now.
- `job-department-manager` was renamed `job-viewer` and reduced to `job:read` — it manages nothing and is department-blind like every other role.
- The "empty department set = unscoped" footgun and its loud Users-UI warning are gone; an empty set now just means no Department recorded.
- Do **not** "helpfully" re-wire `user_department` into permission checks — the table gating nothing is deliberate. If department-scoped scheduling becomes a real requirement, reintroduce it as an explicit new decision (a fresh ADR), not by resurrecting the old plumbing.
