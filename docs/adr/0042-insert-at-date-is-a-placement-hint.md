# Insert-at-Date Is a Placement Hint, Not a Pinned Start

Refines ADR-0036 (Slot dates are derived) and ADR-0037 (Idle Slots are first-class). Booking a Job onto a Bay has so far always appended to the queue end, giving the planner no way to make an urgent Job start sooner than the queue end and no feedback about when work will start. We want the planner to pick a start date — without reintroducing stored dates into the relative scheduling model.

## Decision

A booking may carry a picked **start date**, which is a **placement hint, never stored**. At booking time, under the Bay row lock (still the single serialization point for queue mutations), the date is resolved against the live Slot Projection into a Bay Queue position:

- A date landing **strictly inside** an existing Slot **splits** that Slot — Work and Idle alike — into two Slots preserving the kind, Job (or Idle label), and the total working days across the halves, with the new Slot inserted between and everything after pushed later. Idle is reserved Bay time: it is split exactly like work, never consumed or shrunk.
- A date **exactly on a Slot's projected start** (its first working day) inserts cleanly before it — no split.
- A date **on or after the Bay's next available day** is a plain append. This is also the clamp rule: if the queue shrank concurrently so the picked date is past the next available day, the booking appends — work starts *earlier* than picked, never later behind machine-made idle.
- A date **on or before today** is floored to tomorrow before resolving: the Slot projected over today is never disturbed. ("Today's slot is sacrosanct" is a resolution bound, not a new runtime state.)
- A date on a **non-working day** is normalized forward to the Bay's next working day, so split halves are always at least one working day.

The pure date→position/split resolution lives in the domain package beside Slot Projection, so the client preview (picker feedback, split warnings, ghost Slots) and the server booking share one implementation. The picker is bounded to honest positions only — earliest tomorrow, latest the Bay's next available day, that Bay's non-working dates disabled — and deliberate deferral past the queue end is expressed by placing Idle Slots, never by a date pick.

A booking carrying a start date requires `job:schedule`. Splits are not audited, consistent with Slot create/resize/remove being unaudited (only reorders are audited).

## Considered Options

- **Pinned start dates — store the picked date and reflow around it.** Rejected: reintroduces the absolute model ADR-0036 exists to avoid. A stored date is an *input* the projection must obey, so every upstream disruption forces a conflict resolution (gap? overlap?) instead of a natural reflow. Anchoring remains deferred.
- **Auto-inserting idle to honor a date past the queue end.** Rejected: fabricates machine-made downtime from a stale picker value. Idle Slots are deliberate, human-placed schedule content (ADR-0037); the clamp-to-append rule keeps that invariant and errs toward starting work sooner.
- **Consuming or shrinking Idle Slots to make room.** Rejected: Idle is reserved Bay time, not free space. A booking inside idle splits it like any Slot, keeping the reservation visible and intact in total.
- **Queued/draft schedule editing in the booking dialogs.** Rejected: surrounding-Slot edits made while booking are immediate, real mutations; Cancel discards only the uncreated booking. A draft layer would fork the mutation path and make Cancel semantics ambiguous.

## Consequences

- **Nothing new is stored.** Slots continue to store only sequence, kind, duration, and references; the picked date dies at resolution time.
- **The resolution is honest only under the Bay lock.** The client preview is advisory; the server re-resolves the date against the live queue inside the booking transaction, so concurrent edits degrade to the clamp rules rather than corrupting the queue.
- **Splitting multiplies rows, not work**: a split preserves total working days, so downstream projections shift only by the inserted Slot's duration.
- **Adjacent same-Job Slots are valid** (they already were — a Job can hold several Slots on one Bay) and a split's halves stay independently resizable and removable.
- **The picker bounds depend on data the client already reads** (next available day, org Off-Days, Bay Calendar Exceptions) — no new read endpoints.
