# Job-Level Lifecycle Does Not Cascade to Stage or Booking Rows

Job-level state (`isPaused`, `isCancelled`, and the derived completion from dates per [ADR-0020](./0020-station-bookings-own-all-schedule-dates.md)) does not mutate Stage or Station Booking rows. Pausing or cancelling a Job leaves Stages and Bookings exactly as they were. Enforcement that no work happens while a Job is paused or cancelled lives at the UI and API guard layers — mutation endpoints check `!job.is_paused && !job.is_cancelled` before any Stage or Booking write.

## Considered Options

- **Cascade Job-level state to Stage/Booking rows.** Rejected: pause is reversible, so a cascade would require an inverse-cascade on resume — duplicating state across two places and risking drift. Same argument applies to cancel.
- **A domain helper that masks Stage/Booking state by Job lifecycle** (computed `effectiveStageState()`). Rejected in favour of explicit boundary-layer guards, which the team finds cleaner and easier to reason about than a helper every consumer must remember to call.

## Consequences

- A future engineer may look at a cancelled Job whose Fabrication row still has `actual_start` set and `actual_end` null, and be tempted to "tidy up" the rows. Don't — the row is an honest historical record of where work was when the Job changed state.
- Every mutation endpoint that writes to `job_stage` or `job_stage_station` must check `!job.is_paused && !job.is_cancelled`. The UI mirrors this by disabling controls.
- Pausing or un-pausing a Job is a single boolean write. Same for cancelling/un-cancelling.
