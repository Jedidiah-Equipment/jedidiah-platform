# Bay Scheduling

A Bay Queue is the ordered Slot sequence for one Bay from its `scheduleOrigin`. The Bay row is the serialization point for queue mutations. Slot sequence is contiguous, and Work Slots can reference the same Job more than once, even on the same Bay.

Slots are whole-day planning blocks. Work Slots reference Jobs; Idle Slots reserve working time without a Job. Idle is deliberate queue content, not an Off-Day and not hidden buffer time. Auto-inserted idle gaps and manually inserted Idle Slots are the same domain shape once created.

Slot dates are derived, never stored on Slots. Projection walks the Bay Queue from the Bay's plant business-date origin, consumes each Slot's `durationDays` as working days, and skips the Bay's effective Off-Days. Derived dates are `yyyy-MM-dd` plant business dates that must render identically in every viewer timezone. Africa/Johannesburg appears only at the server boundary to derive plant "today" and new Bay origins.

The Working Calendar is explicit dated facts. Unmarked dates are working days. Org Off-Days close dates for every Bay unless a Bay Calendar Exception overrides that Bay. Overtime opens an otherwise-off day for one Bay; Bay Closure closes an otherwise-working day for one Bay. Projection flows through those facts; no Job is pinned to an opened day.

Insert at Date is a placement hint, not stored state. Under the Bay lock, the chosen date resolves against live projection: inside a Slot splits it, exactly at a Slot start inserts before it, and at or beyond the next available day appends. Server resolution is authoritative; client previews are advisory.

Bay Operator current state is the open Operator Assignment interval. Assignment history is first-class data rather than a sidecar to a current operator column.
