# Job-Level Lifecycle Does Not Cascade to Stage Rows

`job.lifecycle_status` (`active | paused | complete | cancelled`) is the single source of truth for Job-level state. Stage rows do not gain `paused_at` / `cancelled_at` columns and are not mutated when the Job pauses or cancels. Enforcement that no work happens while a Job is non-`active` lives at the UI and API guard layers (mutation endpoints check `job.lifecycle_status === 'active'` before any stage write).

This ADR is about **Job-to-Stage** cascade. It does not say Stage workflow changes are isolated from Job lifecycle forever: the Dispatch Stage completion is the intentional Stage-to-Job transition that completes the Job. Stage completion and Stage Status synchronization are covered separately in [0005: Stage Completion Is a One-Way Latch](./0005-stage-completion-is-a-one-way-latch.md).

## Considered Options

- **Cascade Job-level state to stage rows.** Rejected: pause is reversible, so a cascade would require an inverse-cascade on resume — duplicating state across two places and risking drift.
- **A domain helper that masks stage state by Job lifecycle** (computed `effectiveStagePhase()`). Rejected in favour of explicit boundary-layer guards, which the team finds cleaner and easier to reason about than a helper that every consumer must remember to call.

## Consequences

- A future engineer may look at a `cancelled` Job whose Fabrication row still shows `started_at` set and `completed_at` null, and be tempted to "tidy up" the stage rows. Don't — the stage row is an honest historical record of where work was when the Job changed state.
- Every mutation endpoint that writes to `job_stage` (or to a stage-payload table) must check `job.lifecycle_status === 'active'`. The UI mirrors this by disabling controls.
- Resuming a paused Job is a single write (flip `lifecycle_status` back to `active`). No stage-row reconciliation.
- The allowed Dispatch Stage-to-Job completion transition is not a lifecycle cascade to Stage rows; it is the Pipeline's terminal transition.
