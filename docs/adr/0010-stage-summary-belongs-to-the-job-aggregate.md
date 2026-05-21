# Stage Summary belongs to the Job aggregate

A Job's per-Stage progress snapshot — the **Stage Summary** (derived state from dates, plus the Stage's own `actual_start`/`actual_end` and its Station Booking dates) — is part of the **Job** aggregate. Any User with `job:read` sees the Stage Summary of all five Stages, including their Station Bookings, unscoped, regardless of Department membership. Department **Scope** continues to govern **Stage Detail** (the edit affordances, future per-Stage captured data) and all Stage / Station Booking writes.

This **amends [ADR-0001](./0001-department-as-separate-authorization-axis.md)**, which stated that Department membership scopes which Stage *rows* a Department-Aware role's verbs apply to — including reads. Scope governs Stage Detail reads and Stage / Booking writes; it does not govern Stage Summary reads.

## Considered Options

- **Keep Stage reads fully Department-scoped (ADR-0001 as written).** Rejected: a Department supervisor cannot see where the other Departments are on a Job. The business needs that cross-Department read for coordination — the explicit motivation for this change.
- **Gate Stage Summary behind a new `job-stage:read-summary` permission.** Rejected: an extra permission for data the business considers non-sensitive. "If you can read the Job, you can see its progress" is simpler.
- **Expose Stage Summary as part of the Job aggregate, gated only by `job:read`.** Accepted: the Summary is conceptually Job-level progress, not Stage-internal workings. `job-stage:*` + Scope still fences off Detail and writes.

## Consequences

- ADR-0001's "Paint sees only Paint Stages" hard requirement is **relaxed**: Paint sees every Stage's Summary, including every Station Booking's dates. Paint still sees only its own Stage Detail and writes only its own Stations.
- The jobs-list endpoint fetches all five Stages with their Station Booking counts unscoped — the per-Department chips on the jobs table are Job data.
- The future Gantt visualisation (deferred) depends on this cross-Department read visibility.
- **Workflow History** event visibility follows the same rule: events belonging to out-of-scope Stages are visible at summary level (e.g. "Paint started") but per-Stage Detail events stay hidden.
- Any genuinely sensitive per-Stage data captured in future must live in Stage Detail, never in Stage Summary.
