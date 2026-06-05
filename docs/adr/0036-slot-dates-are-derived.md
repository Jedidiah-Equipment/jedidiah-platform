# Slot Dates Are Derived, Not Stored

A **Slot** books one Job's Stage onto one **Bay** in that Bay's queue. We store only the Slot's `sequence` (queue position) and `durationMinutes` — never start/end dates. Calendar dates are computed at read time by **Slot Projection**: walk a Bay's Slots in queue order from the Bay's `scheduleOrigin` (today, for now), starting each Slot where the previous one ends. This is the *relative* scheduling model: a Slot finishing early or late naturally reflows everything after it, with no rows to rewrite.

## Considered Options

- **Absolute model — store start/end dates on each Slot.** Rejected: every disruption (a job slips, a bay finishes early, a sick day) forces a manual cascade of date edits down the queue, and stored dates bake in weekend/holiday assumptions that are wrong the moment anything moves. This is the trap the relative model exists to avoid.
- **Relative model — store sequence + duration, derive dates.** Accepted. Dates are an *output*, not an *input*. The plan is self-healing; the working calendar and buffers refine the projection later without changing what is stored.

## Consequences

- **The plan and actuals are different shapes.** This ADR governs the *plan*. Real clock-on/clock-off (time tracking) is a separate, date-stamped concern added later — never folded into Slot columns.
- **Projection is a live server-side read** (same lineage as ADR-0035): the read endpoint returns Slots with computed `startAt`/`endAt`; the Gantt renders what it is handed (Bay = lane). There are no scheduling rollup/reporting tables.
- **Non-overlap is structural**, not enforced by a constraint: a Bay's Slots are a contiguous projected queue and cannot overlap by construction. A Postgres `EXCLUDE USING gist` constraint is deliberately *not* added now — it earns its keep later, on stored date ranges: **actuals** and any **pinned** Slots.
- **Deferred work has prepared seams, so it stays additive:** duration is stored in **minutes** (shift math when the working calendar lands), `scheduleOrigin` is a real datetime (superseded by actuals for in-progress jobs), buffers become an extra term in the projection walk, and `unique(bayId, sequence)` is **deferrable** so drag-to-reorder can renumber a queue in one transaction.
- **v1 scope:** a Department is scheduled iff it has Bays (Fabrication only); mutations are append / remove / resize (reorder deferred); the queue always projects forward from today (in-progress jobs are not yet modelled — that arrives with actuals).
