# Stage Summary belongs to the Job aggregate

A Job's per-Stage progress snapshot — the **Stage Summary** — is part of the **Job** aggregate. Any User with `job:read` sees the Stage Summary of all five Stages, unscoped, regardless of Department membership. Department **Scope** continues to govern **Stage Detail** and Stage writes.

This **amends [ADR-0001](./0001-department-as-separate-authorization-axis.md)**, which stated that Department membership scopes which Stage *rows* a Department-Aware role's verbs apply to — including reads. Scope governs Stage Detail reads and writes; it does not govern Stage Summary reads.

## Considered Options

- **Keep Stage reads fully Department-scoped (ADR-0001 as written).** Rejected: a Department supervisor cannot see where the other Departments are on a Job. The business needs that cross-Department read for coordination — the explicit motivation for this change.
- **Gate Stage Summary behind a new `job-stage:read-summary` permission.** Rejected: an extra permission for data the business considers non-sensitive. "If you can read the Job, you can see its progress" is simpler.
- **Expose Stage Summary as part of the Job aggregate, gated only by `job:read`.** Accepted: the Summary is conceptually Job-level progress, not Stage-internal workings. `job-stage:*` + Scope still fences off Detail and writes.

## Consequences

- ADR-0001's "Paint sees only Paint Stages" hard requirement is **relaxed**: Paint sees every Stage's Summary. Paint still sees only its own Stage Detail and writes only its own Stage surface.
- The jobs-list endpoint fetches all five Stages unscoped — the per-Department chips on the jobs table are Job data.
- Any genuinely sensitive per-Stage data captured in future must live in Stage Detail, never in Stage Summary.
