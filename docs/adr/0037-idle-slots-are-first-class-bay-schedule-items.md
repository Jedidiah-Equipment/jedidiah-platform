# Idle Slots Are First-Class Bay Schedule Items

Bay scheduling uses a fixed-origin, relative queue: a Bay's `scheduleOrigin` is the anchor, and **Slot Projection** derives dates by walking Slots in sequence order. That works for continuous work, but it needs an explicit representation for downtime. If the queue ended last week and a planner books new work today, moving the origin or flooring the whole projection to today would rewrite earlier Slots. Hidden read-time gaps have the opposite problem: they affect the schedule without becoming planner-visible schedule objects.

## Decision

Represent downtime as first-class **Idle Slots** in the same `job_slot` queue as work Slots.

A Slot has a `kind`:

- `work`: books one Job Stage onto the Bay.
- `idle`: reserves Bay time without a Job Stage.

Idle and work Slots share queue semantics: Bay, sequence, whole-day duration, projection, resize, remove, and downstream reflow. They differ only in what they point at and how they display. Work Slots require a `jobStageId`; idle Slots require no `jobStageId`. Idle Slots may carry a nullable label. A null idle label displays as the domain default label, `Idle`, rather than being persisted as filler text.

Slot durations are whole-day planning blocks. Store `durationDays`, not `durationMinutes`. If minute-level planning becomes real later, it can earn a migration of its own; the Bay Gantt model today is day-granular.

## Insertion

Idle Slots enter the queue in three ways:

- **Automatic gap insertion during work booking.** When booking a work Slot and the existing projected queue ends before today's full-day start, insert an idle Slot for that exact whole-day gap, then append the work Slot after it. This happens inside the booking transaction only; reads do not mutate schedules and there is no background normalizer.
- **Context menu: Add idle slot before.** A planner right-clicks any Slot and chooses `Add idle slot before`. The system inserts a one-day idle Slot immediately before the target Slot and shifts later sequences.
- **Context menu: Add idle slot after.** A planner right-clicks any Slot and chooses `Add idle slot after`. The system inserts a one-day idle Slot immediately after the target Slot and shifts later sequences.

Manual insertion is target-slot based, not sequence-number based. The client sends the target Slot and placement; the server locks the authoritative queue, computes the insertion sequence, shifts rows, and inserts the idle Slot. Adjacent idle Slots are valid and are not merged automatically. A planner can remove one and resize another if they want to consolidate downtime.

## Consequences

- **The origin stays fixed.** Downtime is expressed as queue content, not by moving `scheduleOrigin`.
- **Projection stays simple.** Every Slot advances the cursor by its `durationDays`; idle Slots are not special in projection.
- **Historical and upstream Slots do not move just because today moved.** A new booking after an idle period gains an idle Slot before it; earlier Slots stay where the fixed-origin projection placed them.
- **The chart tells the truth.** Idle time is visible, colored differently from booked Job work, and does not display as a Job bar.
- **No source distinction.** A system-created idle Slot and a planner-created idle Slot are both just idle Slots. Once it exists, users can resize or remove it the same way.
- **Queue mutations stay serialized.** UI actions that add idle, book work, resize, or remove Slots should not stack while another schedule mutation is pending; server transactions still own the data consistency boundary.

