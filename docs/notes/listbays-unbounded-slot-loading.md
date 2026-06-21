# `listBays` Loads the Full History, Not Just the Board

Date: 2026-06-21

## Finding

`jobs.listBays` returns **every Slot ever booked into a Bay**, projected from the Bay's
`scheduleOrigin` forward — past, present, and future. There is no pruning of completed or
historical Slots anywhere in the read path. Any client that joins Job detail onto those Slots
therefore touches every Job that has ever had a Slot in any Bay, not just the Jobs on today's board.

This is a property of `listBays` itself, shared by web (shop floor, gantt) and mobile, not something
introduced by the per-Slot Job summary added to `BayListResult` in June 2026.

## Why there is no pruning

- `jobs` has no status/completion column and `job_slot` has no status or soft-delete
  ([pkg/db/src/schema/job.ts](../../pkg/db/src/schema/job.ts)).
- A Bay's `scheduleOrigin` is set once at creation and never advances
  ([job-bay-service.ts](../../pkg/core/src/jobs/job-bay-service.ts)).
- `findBayScheduleRows` loads all Slots for a Bay with no `where` on Slots, and `projectJobSlots`
  lays out every Slot from the origin forward
  ([job-read-service.ts](../../pkg/core/src/jobs/job-read-service.ts),
  [job-slot-projection.ts](../../pkg/domain/src/jobs/job-slot-projection.ts)).
- A Slot only disappears via a manual `removeJobSlot`, or by cascade when its Job row is deleted.
  Completing a Job does nothing to its Slot. The "auto-insert idle gap when the Bay queue ended in
  the past" booking behaviour is direct evidence that finished Work Slots persist in the queue.

Consequence: each Bay's Slot list — and the deduplicated `BayListResult.jobs` summary built from it —
grows unbounded over the Bay's lifetime. Mobile's bay-list/bay-schedule hooks discard most of it
client-side (`slot.endDate > today`).

## Scope of the current job-summary change

The `BayListResult.jobs` field reduced load relative to the prior behaviour (clients previously fetched
*every* Job in the system via an unpaged `jobs.list`, including never-booked Jobs). The new field is
limited to *slotted* Jobs and deduplicated. It is strictly less, but still `O(all historical slotted
Jobs)`, not `O(today's board)`.

## Fix options (not yet decided)

- **Payload-only (cheaper):** keep projecting the full queue server-side — Slot start dates depend on
  cumulative durations from the origin, so the DB must still read them — but drop fully-past Slots
  (`endDate <= today`) from the returned `items[].slots` and build `jobs` from only the active+future
  window. Shrinks the wire payload and the Job join to what the UI uses. Risk: web views that render
  schedule *history* (gantt, job calendar) would lose past Slots, so this likely needs a windowed
  variant/param rather than a blanket change to `listBays`.
- **DB-bounded (deeper):** advance `scheduleOrigin` past completed Slots (archive/prune them), or
  materialize Slot start dates so the read can query a date window directly. This is the only option
  that bounds the database scan, not just the payload.

Before adopting the payload-only option, confirm whether web's gantt/job-calendar actually relies on
past Slots.
