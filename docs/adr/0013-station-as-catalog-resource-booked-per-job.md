# Station as a Department-scoped Catalog Resource, Booked per-Job

A **Station** is a named physical resource (e.g. "Weld Bay 1", "Paint Booth A") owned by exactly one **Department** and stored in a `station` catalog table independent of any Job. A Job's **Stage** carries zero or more **Station Bookings** (`job_stage_station` rows) — each referencing a catalog Station and carrying its own `due_start`, `due_end`, `actual_start`, `actual_end`. This is the unit Department Managers Start/Stop and the unit a future Gantt visualization will use to detect cross-Job overlap on shared Stations.

## Decision

- One catalog: `station(id, name, department, is_active, display_order, ...)`.
- One booking child: `job_stage_station(id, job_stage_id, station_id, due_start, due_end, actual_start, actual_end, *_set_manually)`.
- Stations are soft-deactivated, never hard-deleted, to preserve historical bookings.
- A Station belongs to exactly one Department (a Paint Booth is a Paint resource, never a Fabrication one).
- The default Station list per Department is defined on each Product; the Create-Job dialog pre-fills from the Product and the `job-supervisor` may add/remove before save and at any point post-create.

## Considered Options

- **Per-Job sub-step (no catalog)**. Rejected: the Gantt overlap requirement ("Station A booked twice on the same day across two Jobs") becomes a string-match across denormalised names. Catalog identity is the right shape for the cross-Job query.
- **Catalog only, no per-Job dates**. Rejected: we need per-Job due/actual dates on a Station; the Station catalog alone has no place to hang them.
- **Hybrid — Department-scoped catalog + per-Job bookings**. Accepted.

## Consequences

- The user↔Station link planned for `job-department-member` (deferred role) attaches to the catalog row, not per-Job rows — clean shape.
- Adding a Station to the Catalog has no retroactive effect on in-flight Jobs.
- Removing a Station from a Product's default list has no effect on already-created Jobs (defaults applied at Job-creation time).
- Gantt query is `SELECT station_id, due_start..due_end FROM job_stage_station` — a simple time-range overlap.
