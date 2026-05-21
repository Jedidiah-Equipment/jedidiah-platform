# Sticky-Override Date Cascade at Three Levels

Dates (due and actual; start and end) live at three levels: **Job**, **Stage**, **Station Booking**. They cascade — due dates downward (Job → Stage → Booking) when Job-level dates change; actual dates upward (Booking → Stage → Job) when floor work is recorded. Every cascade respects a per-field **sticky-override** marker: a field set explicitly by a user is pinned and never overwritten by future cascades. Clearing the field re-enables auto-derivation.

## Decision

**Schema:** every date field carries a companion marker (`*_set_manually` boolean, or `set_by_user_id`).

**Cascade-Down (Due Dates):**
- At Job creation, the supervisor enters Job `due_start` **or** `due_end` (toggle).
- The system walks forward (from `due_start`) or backward (from `due_end`) through Stage durations from the Product to compute Stage `due_start`/`due_end`.
- Station Booking due dates inherit their Stage's window verbatim (per-Station durations are not modelled).
- Editing a Job-level due date *shifts* auto fields by the delta; sticky fields are pinned.
- Warning (not block) when implied schedule is infeasible (e.g. duration sum > Job window).

**Cascade-Up (Actual Dates):**
- Stage `actual_start` defaults to `MIN(station.actual_start)`; Stage `actual_end` defaults to `MAX(station.actual_end)` — unless sticky.
- Job `actual_start` defaults to `MIN(stage.actual_start)`; Job `actual_end` defaults to `MAX(stage.actual_end)` — unless sticky.
- Every Station Booking write recomputes the parent Stage's auto-fields and, transitively, the Job's auto-fields.

**Override Audit:**
- A `job-supervisor` direct edit to any due or actual field emits a `date.overridden` Job Event with `{ entity_level, entity_id, field, old_value, new_value }`, in the same transaction as the Audit Event.

## Considered Options

- **Full re-cascade overwrites everything.** Rejected: silently destroys supervisor tweaks.
- **No cascade — supervisor maintains all dates manually.** Rejected: the whole point of Product durations is to default the schedule.
- **Prompt the supervisor on every change ("re-cascade?")**. Rejected: friction for the common case (Job-end shifts by 2 days; everything should slide along).
- **Sticky-override per field with shift-by-delta semantics.** Accepted.

## Consequences

- More state per row (one boolean companion per date field — 4 per Job, 4 per Stage, 4 per Booking). Acceptable for prototype; can be folded into a single bitmask if it bloats.
- The mental model is the same for due and actual cascades: "set it manually and it sticks; clear it to re-auto."
- A supervisor can rebuild a schedule cleanly by clearing all sticky markers on a level and letting the cascade re-derive.
- The `date.overridden` event makes "who reached in and moved this" a first-class fact in the Workflow History.
