# Stage and Job State Are Derived from Dates, Not Stored

Stage and Station Booking state — `pending | in-progress | complete` — is **derived** from `actual_start` / `actual_end` at read time. No `status` column is stored. Job state (`not-started | active | paused | complete | cancelled`) is also derived, from `actual_start` / `actual_end` plus two boolean flags `isPaused` / `isCancelled`.

## Decision

Stage / Station Booking derived state:
```
actual_start IS NULL                     → 'pending'
actual_start set, actual_end NULL        → 'in-progress'
actual_end set                           → 'complete'
```

Job derived state (precedence order):
```
isCancelled                              → 'cancelled'
isPaused                                 → 'paused'
job.actual_end IS NOT NULL               → 'complete'
job.actual_start IS NOT NULL             → 'active'
else                                     → 'not-started'
```

- `isPaused` and `isCancelled` are stored booleans on the Job. Both block Department-Manager Start/Stop and any actual-date writes by Department Managers. `job-supervisor`s retain full date-edit authority while paused/cancelled.
- Both flags are reversible (prototype model). A one-way latch can be added later if business requires.

## Considered Options

- **Keep the per-Department Stage Status text enum**. Rejected: with Stations now carrying the granular activity, the Stage's "what kind of in-progress are we in" no longer needs a textual enum. Any richness lives at the Station level (or in future per-Station status, if needed).
- **Store `lifecycle_status` enum on Job**. Rejected: with two independent boolean concerns (paused, cancelled) and the rest of state being date-driven, a single enum forces synthetic transitions and tempts cascading writes. Two booleans + derived view is cleaner.
- **Single-source-of-truth dates with no stored Status anywhere**. Accepted.

## Consequences

- The Zod discriminated-union status validator from ADR-0002 is retired.
- Reads computing display state are cheap (single row) but must use a shared helper to stay consistent.
- "Complete" no longer has its own write event; it's the consequence of `actual_end` being set. The Job Event log emits `job.completed` only when the *cascade* fires (last Stage's `actual_end` propagating up).
- Pause and cancel are honest user-facing concerns and remain explicit booleans — they cannot be expressed as dates.
- Lifecycle still does not cascade to Stage rows (ADR-0003 holds, with wording updated for the new flags).
