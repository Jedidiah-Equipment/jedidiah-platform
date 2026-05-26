# Job Status Does Not Cascade to Stage Rows

A Job's `status` (see [ADR-0021](./0021-job-status-is-a-manual-stored-decoupled-field.md)) does not mutate Stage rows. Changing a Job's status leaves Stage rows exactly as they were.

## Considered Options

- **Cascade Job status to Stage rows.** Rejected: status is freely reversible, so a cascade would require an inverse-cascade on every change — duplicating state across two places and risking drift.
- **A domain helper that masks Stage state by Job status** (computed `effectiveStageState()`). Rejected in favour of keeping Job status and Stage state explicit at the boundary.

## Consequences

- A future engineer may look at a cancelled Job with Stage rows that still look unfinished and be tempted to "tidy up" the rows. Don't — Stage state is separate from Job status.
- Changing a Job's status is a single column write.
