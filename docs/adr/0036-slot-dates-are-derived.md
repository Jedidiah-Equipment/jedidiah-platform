# Slot Dates Are Derived, Not Stored

Updated by ADR-0037: Bay Slots are whole-day planning blocks stored as `durationDays`, and idle time is represented by first-class idle Slots in the same queue.

Updated by ADR-0038: `durationDays` counts working days; Slot Projection skips explicitly-marked Off-Days (the deferred "working calendar" seam), and per-Bay overtime opens Off-Days for one Bay.

Updated by ADR-0043: scheduling dates are whole `yyyy-MM-dd` plant business dates, not instants — `scheduleOrigin` is stored as a plain date, reads ship `startDate`/`endDate`, and Africa/Johannesburg enters only at the server boundary.

A **Slot** is one whole-day planning block in one **Bay** queue. We store only the Slot's `sequence` (queue position), `kind`, and `durationDays` — never start/end dates. Calendar dates are computed at read time by **Slot Projection**: walk a Bay's Slots in queue order from the Bay's fixed `scheduleOrigin`, starting each Slot where the previous one ends. This is the *relative* scheduling model: a Slot finishing early or late naturally reflows everything after it, with no rows to rewrite.

## Considered Options

- **Absolute model — store start/end dates on each Slot.** Rejected: every disruption (a job slips, a bay finishes early, a sick day) forces a manual cascade of date edits down the queue, and stored dates bake in weekend/holiday assumptions that are wrong the moment anything moves. This is the trap the relative model exists to avoid.
- **Relative model — store sequence + duration, derive dates.** Accepted. Dates are an *output*, not an *input*. The plan is self-healing; the working calendar and buffers refine the projection later without changing what is stored.

## Consequences

- **The plan and actuals are different shapes.** This ADR governs the *plan*. Real clock-on/clock-off (time tracking) is a separate, date-stamped concern added later — never folded into Slot columns.
- **Projection is a live server-side read** (same lineage as ADR-0035): the read endpoint returns Slots with computed `startAt`/`endAt`; the Gantt renders what it is handed (Bay = lane). There are no scheduling rollup/reporting tables.
- **Non-overlap is structural**, not enforced by a constraint: a Bay's Slots are a contiguous projected queue and cannot overlap by construction. A Postgres `EXCLUDE USING gist` constraint is deliberately *not* added now — it earns its keep later, on stored date ranges: **actuals** and any **pinned** Slots.
- **Deferred work has prepared seams, so it stays additive:** actuals (real clock-on/clock-off) arrive later as their own date-stamped columns (ADR-0043 keeps `scheduleOrigin` a plain business date), explicit idle Slots carry visible downtime, and `unique(bayId, sequence)` is **deferrable** so drag-to-reorder can renumber a queue in one transaction.
- **v1 scope:** a Department is scheduled iff it has Bays (Fabrication only); mutations are append / add idle / remove / resize (reorder deferred); the queue projects from fixed Bay origin (in-progress jobs are not yet modelled — that arrives with actuals).
