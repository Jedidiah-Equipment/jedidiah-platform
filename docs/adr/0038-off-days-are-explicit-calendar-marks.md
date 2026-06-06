# Off-Days and Overtime Are Explicit Calendar Marks the Projection Skips

Refines ADR-0036 (Slot dates are derived) and ADR-0037 (Idle Slots), which deferred the working calendar with the note that "the working calendar and buffers refine the projection later without changing what is stored." This ADR fills that seam.

Bay scheduling derives Slot dates by walking a Bay's queue from a fixed `scheduleOrigin` (Slot Projection). Until now projection used a raw `addDays`, so every calendar day was implicitly a working day — weekends, public holidays, shutdowns, and per-Bay overtime did not exist. We need the schedule to respect when the factory actually works, including an irregular week (e.g. a worked first Saturday, an unworked last Friday) and one-off per-Bay overtime, **without** reintroducing stored dates or letting the schedule's history rewrite itself.

## Decision

A Slot's `durationDays` counts **working days**, not calendar days. Slot Projection consults a **Working Calendar** to skip **Off-Days** when laying each Slot on the calendar, so a Slot can span an Off-Day on the chart. Idle Slots and the auto-inserted idle gap are likewise counted in working days.

The Working Calendar is **explicit dated facts, never an inferred recurring rule**:

- An **unmarked date is a working day.** Off-Days are marked explicitly, each as its own per-date record (no ranges — a multi-day shutdown is several individually-tracked Off-Days sharing an optional reason label).
- Off-Day is a **single primitive** with an optional reason label. Weekends-not-worked, public holidays (Africa/Johannesburg), and shutdowns are not distinct types — just the same Off-Day with different labels.
- Marks are layered, **most-specific-wins**: a per-Bay **Bay Calendar Exception** (whole-day **Overtime** opens an Off-Day; **Bay Closure** closes a working day) overrides an org-wide Off-Day for that Bay, which overrides the unmarked working default. Projection reads a Bay's *effective* calendar (org Off-Days overlaid with the Bay's Exceptions).

**Overtime opens a working day for a Bay; the queue flows into it.** It does not pin any Job to the date — whichever Slot sits at the projection cursor consumes the opened day. This keeps Slot dates an output, never an input.

Org Off-Days are admin-managed; Bay Calendar Exceptions reuse the existing Bay-schedule permission (`canEditBaySchedule`).

## Considered Options

- **A live work-week rule consulted at projection time** (e.g. "the week is Mon–Fri" + exceptions). **Rejected.** Because projection recomputes dates on every read, a mutable rule would retroactively move the dates of Slots that already happened — the schedule's past would rewrite itself whenever someone edited the rule. It also cannot express an irregular week (worked first Saturday, unworked last Friday) cleanly. Explicit per-date marks are immune: changing how *future* dates are marked never disturbs days already marked.
- **Off-Days as injected Idle Slots.** Rejected: pollutes every Bay queue with non-planner rows, and conflates "non-working date" with "a working day deliberately left empty." Off-Days are stepped over by projection; Idle Slots are consumed by it.
- **Unmarked = off (a bounded, maintained working window).** Rejected in favour of unmarked = working: fewer marks and it matches the planners' mental model. The fail-silent risk (projection assuming a 7-day week past an unmaintained horizon and reporting jobs finishing too early) is mitigated with a **UI warning when a Bay's projected queue end runs past the last marked Off-Day**, rather than by flipping the default.
- **Per-day overtime hours.** Rejected: the model is day-granular (ADR-0037 stored `durationDays`, not minutes). Overtime is whole-day; sub-day planning can earn its own migration later.

## Consequences

- **`durationDays` now means working days everywhere.** `getIdleGapDaysBeforeAppend` (currently `differenceInCalendarDays`) must be reworked to count working days between a Bay's queue end and today; otherwise a late booking's auto-idle gap overshoots today once Off-Days are skipped.
- **Projection becomes Bay-specific** via the Bay's effective calendar: two Bays with identical queues can project to different dates if one has Overtime/Closure exceptions.
- **The calendar must be maintained forward** by an admin. Running a queue past the maintained horizon is surfaced as a UI warning, not a silent assumption.
- **Changing Off-Days reflows downstream Slots** — the same self-healing property as resize/remove. Editing a *past* Off-Day would reflow history, so calendar edits are forward-looking by convention (actuals will later supersede projection for in-progress work, per ADR-0036).
- **Storage stays minimal on the Slot.** No dates are added to `job_slot`; the new state is the Working Calendar (org Off-Days) and Bay Calendar Exceptions, read by projection.
