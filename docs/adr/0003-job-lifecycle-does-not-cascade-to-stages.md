# Job Status Does Not Cascade to Stage or Booking Rows

A Job's `status` (see [ADR-0021](./0021-job-status-is-a-manual-stored-decoupled-field.md)) does not mutate Stage or Station Booking rows. Changing a Job's status leaves Stages and Bookings exactly as they were. Enforcement that no work happens unless a Job is `active` lives at the UI and API guard layers — Start/Stop endpoints check `job.status === 'active'` before any Station Booking write (the **Start/Stop Gate**).

## Considered Options

- **Cascade Job status to Stage/Booking rows.** Rejected: status is freely reversible, so a cascade would require an inverse-cascade on every change — duplicating state across two places and risking drift.
- **A domain helper that masks Stage/Booking state by Job status** (computed `effectiveStageState()`). Rejected in favour of explicit boundary-layer guards, which the team finds cleaner and easier to reason about than a helper every consumer must remember to call.

## Consequences

- A future engineer may look at a cancelled Job whose Fabrication row still has `actual_start` set and `actual_end` null, and be tempted to "tidy up" the rows. Don't — the row is an honest historical record of where work was when the Job's status changed.
- Every endpoint that writes to `job_stage_station` via Start/Stop must check `job.status === 'active'`. The UI mirrors this by disabling controls. `job-supervisor` / `admin` date edits are not gated.
- Changing a Job's status is a single column write.
