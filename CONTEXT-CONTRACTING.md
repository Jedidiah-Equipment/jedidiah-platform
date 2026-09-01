# Jedidiah Contracting Context

Glossary for the Jedidiah Contracting side of the platform (see [CONTEXT-MAP.md](CONTEXT-MAP.md)).
The app's modes display as **Jedidiah Equipment** and **Jedidiah Contracting**; the codename
"JedConOps" is retired and never appears in code or UI.

## Core Model

**Job** is one piece of contracted field work for one **Customer**: a Work Type, a freeform
description, a status, and one responsible **Foreman**. Jobs are pre-created by management into
the **Upcoming** list — foremen never create Jobs and never type anything except hours. Across
contexts, say **Contracting Job**; it is unrelated to the Equipment context's Job. A Job's
statuses: **Upcoming** (pre-created; freely editable and deletable; the future-work list; visible
to management only until a Foreman is assigned), **Active** (entered automatically when its first
machine starts; cancellable by management with a mandatory reason), **Completed** (the
Contracting Manager's sign-off: work confirmed done, Charge Lines and notes added, final start
and end dates stamped — suggested from first machine start and last machine stop, tweakable),
**Priced** (rates applied and frozen as a snapshot), and **Invoiced** (the invoice number stamped;
the wall — after it, nothing moves). There is no "submitted" status: foremen never close Jobs; a
Job whose machines have all stopped surfaces in the Contracting Manager's queue as looking
finished. Every stage has a visible queue, so work cannot vanish between a foreman's phone and
the invoice — that chain is the app's core promise.

**Machine Assignment** is one Machine's stint on one Job: created when the Foreman puts the
machine on the Job, closed when it leaves, carrying its own start and end. A Machine has **at most
one open Machine Assignment**, which is what enforces that a machine is never on two Jobs at once.
The Foreman edits only his own Job's Assignments and only while the Job is Active; after
Completion only management amends. Avoid Slot (an Equipment scheduling term).

**Job Card** is the rendered document of a Job — its Assignments, hours, travel, Charge Lines,
rates, and totals — reviewed at sign-off, priced, and keyed into the invoicing system. It is a
presentation of the Job, never a second record: "send me the job card" means the document.

**Charge Line** is a non-hourly amount on a Job — transport (e.g. a low-bed move) or diesel the
business supplied (diesel may record litres) — description plus amount, added by management at
Completion or Pricing.

**Work Type** is an admin-managed list of kinds of contracted work (dam building, disking,
planting, …), exactly one per Job, set at pre-creation. It is the reporting dimension for future
utilisation views.

**Preset Rate** is the per-Category hourly rate maintained by management, prefilled onto each
Machine Assignment at Pricing and editable per Assignment; travel hours bill at the same rate when
included. Discounts are edited numbers, not a mechanism.

**Invoice Number** is the terminal stamp on a Job, recorded by the invoicing user from the
external accounting system. Stamping it is what makes a Job Invoiced.

**Machine** is one piece of the contracting fleet, identified by its code. Its full model
(categories, drivers, availability, the optional Product Unit link) is specified in the fleet
model; only what other terms here need is stated: a Machine is what an Assignment assigns.

**Job Number** is the Job's `CJOB-xxxxx` code, an automatic sequence distinct from the Equipment
context's `JOB-xxxxx`.
