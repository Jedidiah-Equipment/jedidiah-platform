# Jedidiah Contracting Context

Glossary for the Jedidiah Contracting side of the platform (see [CONTEXT-MAP.md](CONTEXT-MAP.md)).
The app's modes display as **Jedidiah Equipment** and **Jedidiah Contracting**; the codename
"JedConOps" is retired and never appears in code or UI.

## Core Model

**Job** is one piece of contracted field work for one **Customer**: a Work Type, a freeform
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

**Machine Assignment** is one Machine's stint on one Job: created when the Foreman puts the
machine on the Job, closed when it leaves, carrying its arrival and departure Hour Readings. A
Machine has **at most one open Machine Assignment**, which is what enforces that a machine is
never on two Jobs at once. The Foreman edits only his own Job's Assignments and only while the
Job is Active; after Completion only management amends. Avoid Slot (an Equipment scheduling
term).

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

**Machine** is one piece of the contracting fleet: a make and model (entered via creatable
selects so spelling stays consistent), a registration number, a hand-entered unique **Machine
Code** following the fleet's `JD6140M-1` convention, a **Category**, an optional current
**Driver**, and notes. A Machine is what an Assignment assigns. It has no reference to the
Equipment context: the two businesses share no machine identity. A Machine is **On Job** while it
has an open Assignment and otherwise **In Yard** — derived, never stored, with no manual flag;
the **Machine Yard** view lists In Yard machines by Category, and an open fault shows as an
indicator, not a third state. A Machine with any history is never deleted: it is **Retired** with
a mandatory reason, hidden from every picker and the yard view, history intact and un-retirable;
only a never-used entry may be deleted. Avoid Unit, Product Unit, Vehicle, or Asset.

**Category** is the admin-managed grouping of Machines (excavator, TLB, hauler tractor, grader,
…): the shortlist dimension in pickers, the grouping of the Machine Yard, the future utilisation
dimension, and the home of the Preset Rate.

**Driver** is a non-login user record (the bay-operator pattern): drivers take instructions and
never sign in. The Machine carries its current Driver; each Machine Assignment snapshots its
driver at start — defaulted from the Machine, overridable by the Foreman from the pre-saved list
— so a driver's history is derivable from Assignments and survives reshuffles.

**Job Number** is the Job's `CJOB-xxxxx` code, an automatic sequence distinct from the Equipment
context's `JOB-xxxxx`.

## Hours

**Hour Reading** is one captured value of a Machine's hour meter: the value, when and by whom it
was captured, and its evidence — a photo whose AI-read value the Foreman confirmed, or a manual
entry, which stamps the reading **Missing Photo Evidence**. A reading plays one of three roles:
**arrival** (machine on site) and **departure** (machine leaving) on a Machine Assignment, or
**spot** — an ad-hoc field capture with no billing effect, existing to keep a Machine's known
hours current for service tracking. The
pre-travel opening is never captured: it is the machine's previous departure reading, so travel
and work time are derived and no hour can vanish between Jobs. A Machine's readings only ever
increase: a capture at or below the latest reading is refused with a re-take prompt, unless the
Foreman asserts the previous reading is wrong, which saves his value as disputed and flags the
pair for management. A photo reading the server's later verification disagrees with carries an
evidence warning into sign-off; the Foreman is never re-interrupted in the field. The Foreman may
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

**Breakdown** is one reported problem on one Machine — there is no separate "fault" type; an open
Breakdown *is* an outstanding fault. Any login user may report one (usually the Foreman): photos,
a description in the reporter's own words (typed, or a transcribed voice note the reporter can
edit), an optional link to the Job it happened on (defaulted from the machine's open Assignment,
which is what locates it for the workshop), optional GPS, and an **urgency** — *machine down* or
*still working*. Status runs **Open → In Progress → Solved**; the workshop manager owns every
transition and closes with a mandatory close-out note. A Machine's Breakdown history is
permanent. The dispatch cross-reference — other machines on the same Job with open Breakdowns —
is derived, never stored. New Breakdowns notify the workshop manager by push notification;
machine-down urgency also notifies management.

**Breakdown Note** is one entry in a Breakdown's append-only note thread: author, text (voice
note supported), time. Contracting's own mechanism — never the Equipment context's Feedback.

**Mechanic** is a non-login user record, like Driver: mechanics take instructions and never sign
in. Exactly one primary Mechanic is assigned per Breakdown by the workshop manager, possibly
himself; a second body on site is never recorded. Mechanic performance — report-to-Solved time —
is derived, never stored.

**Service Record** is the digitized page of the paper service book: one service performed on one
Machine — date, the hour reading at service, the primary Mechanic, and free-text notes. A
Service is a recurring, expected event and deliberately not a Breakdown. Recording one stamps the
Machine's **Next Service Due** forward by its **Service Interval** (both in hours; the dash
sticker, digitized). **Service Due Soon** is the derived flag raised when the Machine's latest
known Hour Reading comes within a threshold of Next Service Due — kept honest mid-job by spot
readings from the field — and it notifies the workshop manager by push notification.

## Access

A user's contracting role fills one of the two role slots defined in
[CONTEXT-MAP.md](CONTEXT-MAP.md); holding one is what grants Jedidiah Contracting access at all.
Server-side checks are the security boundary; browser checks are UX only.

- **contracting-admin**: every contracting permission the spanning super-admin has — Pricing,
  Preset Rates, fleet, invoice stamping, all of it — without user administration and without any
  Equipment reach.
- **contracting-manager**: all operations — Job create/edit/assign/complete/cancel, reading
  amendments and gap resolution, breakdowns and servicing, fleet management — but no Pricing and
  no Preset Rates; sees priced amounts.
- **workshop-manager**: reads everything contracting; writes Breakdowns (mechanic assignment,
  transitions, close-out) and Servicing (records, interval and due fields); reports Breakdowns.
- **foreman**: sees only Jobs assigned to him; manages his own Assignments and captures readings;
  reports Breakdowns; never sees money — no rates and no priced amounts.
- **contracting-invoicing**: reads Priced and Completed Job Cards and stamps the Invoice Number;
  nothing else.

Drivers and Mechanics are non-login user records holding no role. Pricing and Preset Rates
deliberately sit with contracting-admin and super-admin alone; foremen are money-blind by design.

## Reporting

An **Active Day** is a calendar day on which a Machine had an open Assignment. **Utilisation %**
is active days over days in the window, counting only days the Machine was in the fleet — days,
never hours, and month attribution is exact. **Fleet Load** is the share of Machines with at
least one Active Day in the window. **Utilisation Target %** is the single global reference line
management sets on the utilisation charts. Mechanic performance — solved count, average
report-to-Solved time, open count — is derived from Breakdowns and never stored. Reporting is
readable by every role that reads all Jobs; Foremen and invoicing never see it.
