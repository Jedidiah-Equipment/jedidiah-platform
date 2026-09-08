# Jedidiah Contracting Context

Glossary for the Jedidiah Contracting side of the platform (see [CONTEXT-MAP.md](CONTEXT-MAP.md)).
The app's modes display as **Jedidiah Equipment** and **Jedidiah Contracting**; the codename
"JedConOps" is retired and never appears in code or UI.

## Core Model

**Job** is one piece of contracted field work for one **Customer**: a Work Type, a **Farm** (the
place the work happens — first-class, because the workshop reads it as the location), a freeform
description, a status, and one responsible **Foreman**. Jobs are pre-created by management into
the **Upcoming** list — foremen never create Jobs, and on Job data they select from pre-saved
information, typing only hours. That select-don't-type rule is a Job-data rule, not a gag:
breakdown reporting is where a Foreman writes his own words — fault descriptions and voice-note
transcription corrections. Across contexts, say **Contracting Job**; it is unrelated to the
Equipment context's Job. A Job's
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

**Machine Assignment** is one Machine's stint on one Job. Management may plan it when setting
the Job up — machine and Implement chosen ahead of arrival, a **planned** Assignment — or the
Foreman adds it on site; either way it becomes **on site** when its arrival Hour Reading is
captured and **left** when its departure is. A Machine may have **several sequential Assignments
on the same Job** — leaving and returning, often with a different Implement — but **at most one
on-site Assignment at a time across all Jobs**, which is what enforces that a machine is never in
two places at once; planned Assignments never count against that. An Assignment names at most one
**Implement**, and an Implement on a Job is always attached to exactly one Assignment. Management
records zero or more **Measures** on an Assignment — a Measure Type and a quantity (hectares
disked, loads hauled) — the production figures Pricing may bill on. The Foreman edits only his own
Job's Assignments and only while the Job is Active; after Completion only management amends. Avoid
Slot (an Equipment scheduling term).

**Job Card** is the rendered document of a Job — its Assignments, hours, travel, Charge Lines,
rates, and totals — reviewed at sign-off, priced, and keyed into the invoicing system. It is a
presentation of the Job, never a second record: "send me the job card" means the document. It
renders on demand (never stored — priced amounts are frozen, so regeneration is deterministic)
under the Jedidiah Contracting letterhead, in two variants: **internal**, carrying evidence
markers, gap resolutions, capture comments, and attribution; and the **customer copy**, the clean
dispute trail of readings and amounts that shows **one total hours figure per line — never the
work/travel split**. Reading values print; meter photos stay in the app. Diesel is shown
VAT-exempt. Its ex-VAT total is a works summary — a Job Card is never an invoice.

**Charge Line** is a non-hourly amount on a Job — transport (e.g. a low-bed move), a supplied
part, or a fixed quoted total — a description management writes at Completion, with an amount
management may leave blank and Pricing must then set (zero allowed). **Diesel** is not a Charge
Line but a dedicated field on every Job: litres supplied (default zero, set at Completion) and,
when litres are non-zero, an amount set at Pricing; diesel carries no VAT and the Job Card marks it
so. A **Discount** is one optional Job-level reduction — a fixed amount or a percentage — applied
at Pricing and shown on the Job Card.

**Farm** is the place the work happens, scoped to one Customer. Its spelling is kept consistent by
selecting the existing Farm instead of retyping it; different Customers may have Farms with the same name.

**Work Type** is an admin-managed list of kinds of contracted work (dam building, disking,
planting, …), exactly one per Job, set at pre-creation. It is the reporting dimension for future
utilisation views.

**Rate Card** is the list of named **Rates** management maintains and Pricing chooses from —
supervised and unsupervised plant hire, tractor-and-tanker, disking per hectare, … — each with a
**basis**: time (billed per hour of the Assignment's work plus included travel) or one **Measure
Type** (billed per unit of that Measure recorded on the Assignment). **Measure Type** is the
management-maintained list of production units — hectares, loads, … — in display order; a Measure
on an Assignment names one. Rates hang on nothing but their name: not on a Category, a Machine, or
an Implement. At Pricing every Assignment is given a Rate (or a zero rate when a Charge Line carries
a fixed quote) and its amount computes from the basis, editable afterwards.

**Invoice Number** is the terminal stamp on a Job, recorded by the invoicing user from the
external accounting system. Stamping it is what makes a Job Invoiced.

**Machine** is one piece of the contracting fleet: a make and model (entered via creatable
selects so spelling stays consistent), a year, a registration number, a hand-entered unique
**Machine Code** following the fleet's `JD6140M-1` convention, a **Category**, an optional
current **Driver**, and notes. A Machine is what an Assignment assigns. It has no reference to the
Equipment context: the two businesses share no machine identity. A Machine is **On Job** while it
has an **on-site** Assignment and otherwise **In Yard** — a planned Assignment never counts —
derived, never stored, with no manual flag;
the **Machine Yard** view lists In Yard machines by Category, and an open fault shows as an
indicator, not a third state. A Machine with any history is never deleted: it is **Retired** with
a mandatory reason, hidden from every picker and the yard view, history intact and un-retirable;
only a never-used entry may be deleted. Avoid Unit, Product Unit, Vehicle, or Asset.

**Category** is the management-maintained grouping of fleet equipment, of **kind** Machine or
Implement (excavator, TLB, grader, gravel trailer, planter, …): the shortlist dimension in pickers,
the grouping of the Machine Yard, the future utilisation dimension, and the owner of the **icon and
colour** every piece of fleet shows in lists. A Category carries no rate.

**Implement** is one un-metered attachment in the fleet — a disc, planter, ripper, gravel
trailer: a unique **Implement Code** (suggested from its Category and a sequence,
`GRAVEL-TRAILER-3`, editable), a **Category** of kind Implement, and notes. It attaches to a
Machine Assignment beside the Machine — never to a Job on its own, never more than one per
Assignment — and has no hour meter, no readings, and no availability of its own, but it can suffer
a Breakdown. Whether a towed unit is a Machine or an Implement is decided by whether it has a
meter.

**Driver** is a non-login user record (the bay-operator pattern): drivers take instructions and
never sign in. The Machine carries its current Driver; each Machine Assignment snapshots its
driver at start — defaulted from the Machine, overridable by the Foreman from the pre-saved list
— so a driver's history is derivable from Assignments and survives reshuffles.

**Job Number** is the Job's `CJOB-xxxxx` code, an automatic sequence distinct from the Equipment
context's `JOB-xxxxx`.

## Hours

**Hour Reading** is one captured value of a Machine's hour meter: the value, when and by whom it
was captured, and its evidence. The Foreman always types the value; a photo is attached whenever
the camera allows, and a reading without one is stamped **Missing Photo Evidence**. Capture never
waits for signal — readings queue on the phone and sync when they can. After sync the server reads
the photo itself and records its own value and confidence: a reading is **photo-backed** when it
carries a photo and **AI-verified** when the server's read agrees with the typed value.
Disagreements, low confidence, and disputes surface to management as **Reading Exceptions** —
never to the Foreman, who is never re-interrupted in the field. A reading may carry the Foreman's
optional **capture comment**, shown wherever management reviews it; the capture screen shows the
minimum value the meter can now read. A reading plays one of three roles:
**arrival** (machine on site) and **departure** (machine leaving) on a Machine Assignment, or
**spot** — an ad-hoc field capture with no billing effect, existing to keep a Machine's known
hours current for service tracking. The
pre-travel opening is never captured: it is the machine's previous departure reading, so travel
and work time are derived and no hour can vanish between Jobs. A Machine's readings never go
backward: a capture strictly below the latest reading is refused (equal is accepted — an idle
machine reads its departure value), unless the Foreman asserts the previous reading is wrong,
which saves his value as disputed and flags the pair for management. The Foreman may
re-capture a reading only while his Assignment is open; from Completion onward only management
amends, with a mandatory reason, and Invoiced freezes everything. Derived values always recompute
after an amendment.

**Baseline Reading** is a Machine's anchoring first Hour Reading, recorded when the Machine
enters the fleet.

**Hour Gap** is the derived interval between one Assignment's departure reading and the machine's
next arrival reading; spot readings never bound a gap. By default the whole gap is **Travel Hours**, billed to the destination Job
at the Assignment's rate under an include toggle that defaults on; a machine moved by truck simply
has a zero gap. A gap above the single global threshold raises a **Gap Flag**, surfaced at
sign-off and blocking nothing; management resolves it by splitting the gap into billable Travel
Hours and an **Unaccounted Interval** with a mandatory reason, which clears the flag. Time in the
yard is an Unaccounted Interval — there are no internal Jobs.

## Workshop

**Breakdown** is one reported problem on one piece of fleet — a Machine **or** an Implement, exactly
one — there is no separate "fault" type; an open Breakdown *is* an outstanding fault. Any user with Contracting access may report one (usually the
Foreman): photos,
a description in the reporter's own words (typed, or a transcribed voice note the reporter can
edit), an optional link to the Job it happened on (defaulted from the subject's on-site
Assignment — for an Implement, the Assignment it is attached to — which is what locates it for the
workshop and puts it in the same-Job dispatch cross-reference), optional GPS, and an **urgency** — **Code Red**
(machine down) or **Code Green** (still working). Status runs **Open → In Progress → Solved**; the workshop manager owns every
transition and closes with a mandatory close-out note. The subject's Breakdown history is
permanent. The dispatch cross-reference — other fleet on the same Job with open Breakdowns —
is derived, never stored. New Breakdowns notify the workshop manager by push notification;
Code Red also notifies management.

**Breakdown Note** is one entry in a Breakdown's append-only note thread: author, text (voice
note supported), time. Contracting's own mechanism — never the Equipment context's Feedback.

**Mechanic** is a non-login user record, like Driver: mechanics take instructions and never sign
in. Exactly one primary Mechanic is assigned per Breakdown by the workshop manager, possibly
himself; a second body on site is never recorded. Mechanic performance — report-to-Solved time —
is derived, never stored.

**Service Record** is the light digital counterpart of the paper service book, which stays the
detailed record for now: one service on one Machine — start and end date, the hour reading at
service, the primary Mechanic, and free-text notes. A Service is a recurring, expected event and
deliberately not a Breakdown. **Closing a Service Record requires setting the Machine's Next
Service Due** — the number the mechanic prints on the dash sticker at that moment; the Machine's
optional **Service Interval** only pre-fills it from the reading at service. **Service Due Soon** is the derived flag raised when the Machine's latest
known Hour Reading comes within a threshold of Next Service Due — kept honest mid-job by spot
readings from the field — and it notifies the workshop manager by push notification.

## Access

A user's contracting role fills one of the two role slots defined in
[CONTEXT-MAP.md](CONTEXT-MAP.md); holding one is what grants Jedidiah Contracting access at all.
Server-side checks are the security boundary; browser checks are UX only.

- **contracting-admin**: every contracting permission the spanning super-admin has — Pricing,
  the Rate Card, fleet, invoice stamping, all of it — without user administration and without any
  Equipment reach.
- **contracting-manager**: all operations — Job create/edit/assign/complete/cancel, reading
  amendments and gap resolution, breakdowns and servicing, fleet management — but no Pricing and
  no Rate Card; sees priced amounts.
- **workshop-manager**: reads everything contracting; writes Breakdowns (mechanic assignment,
  transitions, close-out) and Servicing (records, interval and due fields); reports Breakdowns.
- **foreman**: sees only Jobs assigned to him; manages his own Assignments and captures readings;
  reports Breakdowns; never sees money — no rates and no priced amounts.
- **contracting-invoicing**: reads Priced and Completed Job Cards and stamps the Invoice Number;
  nothing else.

Drivers and Mechanics are non-login user records holding permissionless contracting roles. Pricing
and the Rate Card deliberately sit with contracting-admin and super-admin alone; foremen are
money-blind by design.

## Reporting

An **Active Day** is a calendar day on which a Machine had an on-site Assignment (planned stints
never count). **Utilisation %**
is active days over days in the window, counting only days the Machine was in the fleet — days,
never hours, and month attribution is exact. **Fleet Load** is the share of Machines with at
least one Active Day in the window. **Utilisation Target %** is the single global reference line
management sets on the utilisation charts. Mechanic performance — solved count, average
report-to-Solved time, open count — is derived from Breakdowns and never stored. Reporting is
readable by every role that reads all Jobs; Foremen and invoicing never see it.
