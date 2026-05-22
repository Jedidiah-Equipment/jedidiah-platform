# Station Bookings Own All Schedule Dates; Stage and Job Dates Are Derived

Schedule dates are stored **only** on Station Bookings. Stage and Job Planned/Actual Windows are a derived rollup, never persisted. The Job carries one optional `due_date` indicator, unrelated to any rollup. This is the single record of the Job date + state model — it replaces and absorbs the deleted ADRs 0005, 0014, 0016, and 0017.

## Context

The earlier model (ADR-0016) stored a Planned and an Actual date pair at all three levels — Job, Stage, Station Booking — wired together by a bidirectional cascade (due dates flowed down, actuals rolled up) with a per-field `*_set_manually` "sticky" marker guarding manual edits. ADR-0005 and ADR-0017 governed when those dates could be edited. In practice this made a Job's schedule hard to reason about: twelve date fields, twelve sticky markers, and two cascade directions whose interaction was rarely obvious. Both the Stage-level and Job-level date sets are fully determined by the Station Bookings beneath them, so storing and cascading them was redundant state.

## Decision

- **Station Booking is the only level that stores schedule dates**: `planned_start`, `planned_end`, `actual_start`, `actual_end`.
- **Stage and Job expose a derived Planned Window and Actual Window** — the `scheduleRollup` domain function: `start` = MIN of the Station Bookings' starts, `end` = MAX of their ends (an `end` contributes only once every booking has one). A Stage rolls up its own Bookings; a Job rolls up **all** its Bookings directly, flattened across Stages — so a Stage with zero Bookings contributes nothing and cannot block Job completion. Computed at read/projection time and at write time for event detection; **never persisted**. `job_stage` loses every date column; `jobs` loses its window columns. All `*_set_manually` markers are deleted.
- **The Job stores one optional `due_date`** — a deadline indicator set manually, with no computed relationship to any Booking, Window, or rollup. Rendered as a red vertical line on the Schedule Gantt.
- **Dates are calculated exactly once**, at Job creation: a transient Creation Anchor (date + start/end choice) cascades through Product Durations to seed each Station Booking's Planned Window. After creation there is no cascade and no sticky state — each Station Booking date is edited individually under one rule: `end` must be on or after `start`.
- **Editable date surface**: Station Booking dates and the Job `due_date`, by `job-supervisor` / `admin` only. Stage and Job Windows cannot be edited — there is nothing stored to write. There is no completion latch; the audit trail (`AuditEvent` + `date.overridden` Job Event) is the safety net.
- **State remains derived from dates.** Stage / Station Booking status (`pending | in-progress | complete`) comes from the Actual Window. Job status precedence is `cancelled` > `paused` > `complete` > `active` > `not-started`, with `isPaused` / `isCancelled` stored booleans. `stage.started/ended` and `job.started/completed` events are emitted at Station-write time when a rollup-compare shows the derived Actual Window flipping from absent to present.

## Considered Options

- **Keep ADR-0016's sticky bidirectional cascade.** Rejected — it is the source of the "hard to reason about" complexity this ADR exists to remove.
- **Store Stage/Job Windows as a denormalised cache, re-synced on every Station write.** Rejected — that is a cascade-up under another name; a write path that forgets the re-sync causes silent drift.
- **Compute-on-read, store nothing at Stage/Job level.** Accepted — the rollup cannot drift, and the Station Bookings are already loaded whenever a Job is read.

## Consequences

- A migration drops all date and `*_set_manually` columns from `job_stage`, and the window/marker columns from `jobs`; `jobs` gains `due_date`.
- The Job list can no longer `ORDER BY` a stored Job end date — date sorting uses the `due_date` indicator instead.
- Stage/Job Windows recompute on every read. This is cheap: the work happens inside the already-loaded Job aggregate, with no SQL aggregates.
- ADR-0005, ADR-0014, ADR-0016, and ADR-0017 are deleted; their still-valid rationale lives here.
