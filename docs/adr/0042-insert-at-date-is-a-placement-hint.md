# Insert-at-Date Is a Placement Hint, Not a Pinned Start

ADR-0036 holds: Slot dates are derived from queue position, never stored. The Create Job form and Book Slot dialog now let a planner choose a start date, which looks like a date becoming an *input*. It is not — the picked date is translated into a Bay Queue position at booking time, under the Bay row lock: a date strictly inside an existing Slot splits it (Work and Idle alike, since Idle Slots are reserved time, not consumable capacity), a boundary date inserts cleanly, and the next available day is a plain append. Nothing about the date is persisted, so the booked Slot reflows with the queue like any other.

## Considered Options

- **Pinned start dates.** Rejected: pinning is a new scheduling primitive (stored date ranges, exclusion constraints, reflow-around-pins) that ADR-0036 deliberately deferred. Nothing here forecloses adding it later.
- **Placement hint resolved at booking time.** Accepted. The picker is bounded to honest positions only: earliest tomorrow (the Slot projected over today is never disturbed) and latest the Bay's next available day (deferral past the queue end is expressed by placing Idle Slots, never by a date pick that would fabricate machine-made idle).
- **Queued draft edits in the Create Job form.** The embedded schedule chart was originally to queue all edits client-side and apply them on submit, so cancel would undo everything. Rejected: it required a draft projection engine, operation replay, and optimistic-concurrency fingerprinting, all to buy an undo that re-editing a slot provides anyway. Instead the embedded chart is the live Gantt — surrounding-slot edits save immediately and survive cancel; only the new Job's Slots are client-projected ghosts until creation.

## Consequences

- The moment after booking, nothing guarantees the Slot still starts on the picked date — upstream edits and calendar changes reflow it silently. That is the accepted price of staying on ADR-0036.
- If the queue shrinks between picking and booking, the server clamps to append: the work starts *earlier* than picked, never later behind auto-inserted idle.
- Insert-at-date can move other Jobs' Slots, so it requires `job:schedule`, not just `job:create`; without scheduling authority, Create Job seeding appends exactly as before.
