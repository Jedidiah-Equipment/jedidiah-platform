# Jedidiah Contracting Context

Glossary for the Jedidiah Contracting side of the platform (see [GLOSSARY-MAP.md](GLOSSARY-MAP.md)).
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
Contracting Manager's sign-off, reachable only once every Assignment has left: work confirmed done, Charge Lines
and notes added, final start and end dates stamped — suggested from when the first arrival and last departure were
captured, tweakable), **Priced**
(rates applied and frozen as a snapshot — diesel litres and travel lock with it; a Job Hours or Travel Hours edit reopens the Job to Completed for
re-pricing — the chosen Rates and their snapshotted unit amounts stay, line amounts recompute from
the amended hours, and manual amount edits are discarded), and **Invoiced** (the invoice number stamped; the wall — after it, nothing moves). There is no "submitted" status: foremen never close Jobs; a
Job whose machines have all stopped surfaces in the Contracting Manager's queue as looking
finished. Every stage has a visible queue, so work cannot vanish between a foreman's phone and
the invoice — that chain is the app's core promise.

**Machine Assignment** is one Machine's stint on one Job. Management may plan it when setting
the Job up — machine and Implement chosen ahead of arrival, a **planned** Assignment — or the
Foreman adds it from the phone, planned until the Machine arrives; either way it becomes **on site** when its arrival hours are
captured and **left** when its departure hours are. A Machine may have **several sequential Assignments
on the same Job** — leaving and returning, often with a different Implement — but **at most one
on-site Assignment at a time across all Jobs**, which is what enforces that a machine is never in
two places at once; planned Assignments never count against that. An Assignment names at most one
**Implement**, and an Implement on a Job is always attached to exactly one Assignment. Management
records zero or more **Measures** on an Assignment — a Measure Type and a quantity (hectares
disked, loads hauled), at most one per Measure Type — the production figures Pricing may bill on.
A planned Assignment whose Machine never arrives is removed — by the Foreman while the Job is
open (Upcoming or Active), by management at sign-off, or by Completion itself, which removes any still waiting — and
leaves nothing behind. The Foreman edits only his own
Job's Assignments and only while the Job is open (Upcoming or Active); after Completion only management amends. Avoid
Slot (an Equipment scheduling term).

**Job Card** is the rendered document of a Job — its Assignments, hours, travel, Charge Lines,
rates, and totals — reviewed at sign-off, priced, and keyed into the invoicing system. It is a
presentation of the Job, never a second record: "send me the job card" means the document. It
renders on demand (never stored — priced amounts are frozen, so regeneration is deterministic)
under the Jedidiah Contracting letterhead, in two variants: **internal**, carrying the amended
marker, Travel Hours, capture moments and comments, and attribution; and the **customer copy**, the clean
trail of hours and amounts that shows **one total hours figure per line — never the
work/travel split**. Job Hours print. Diesel is shown
VAT-exempt. Its ex-VAT total is a works summary — a Job Card is never an invoice.

**Job Sheet** is the signed-in person's reading of one Job on a screen: the served Job Actions and Assignment
Actions, the Machine Assignments in screen order — what is on site, then what is coming, then what has left, each
tier grouped per Machine by first arrival — each with its **stint number** (the Machine's nth stint on this Job),
and which parts of the page show. It is a reading, never a record, and never the Job Card: the Job Card groups by
Machine with no state tier because it is the document. Web and phone read the same sheet; the phone shows less of it.
_Avoid_: job view, view model, Equipment's JobSheet form

**Note Thread** is a record's append-only conversation: a Job has one and a Breakdown has one, and each
entry is a Job Note or a Breakdown Note — author, text (typed or from a Voice Note), time. A thread is read
from its record's Activity and from the cross-Job Activity feed, and a new entry pushes the thread's
**participants** — never its author. Who counts as a participant, and who may add an entry, is the
record's own rule, stated on its entry below; everything else about a thread is the same for both.
_Avoid_: comments, chat, conversation, discussion

**Job Note** is one entry in a Job's Note Thread. Anyone whose Jobs reach includes the Job may add one, in
every status — a note moves no Job data, so the Invoiced wall does not stop it. Its participants are the
Job's Foreman, everyone who has noted it, and the contracting-manager, contracting-admin and super-admin
roles. It is not the Job's **sign-off notes**, the one free-text field management fills at Completion.
_Avoid_: comment, message, chat message, feedback

**Job Actions** are the derived verdicts of what one person may do to a Job in its current status:
change its setup, Foreman, Machine Assignments, Travel Hours, Measures, Charge Lines and their amounts,
sign-off details and diesel litres; complete, cancel, price or stamp it; capture and edit its Job Hours.
They are computed, never stored, and judged for the person asking — a Foreman works only his own Jobs, while
open — and they are the same answer the server's write gates apply, so a screen shows a control
when its verdict allows it and hides it when the person lacks the permission. Both the web and the phone read
the verdicts the server serves; no surface derives its own. A refused verdict carries the
one sentence that says why; the server's refusal and the screen show that sentence. Invoiced and Cancelled
are both closed: no Job Action is open on either. A check that judges what a write carries rather than the
Job — the Mark as Priced gate, the invoice total, a departure below its arrival — is not a Job Action
and stays with the write that reads that input.

**Assignment Actions** are the verdicts of what one person may do to one Machine Assignment now: remove it
while planned; change its Implement and Driver until it has left; capture its arrival while planned and its
departure while on site; edit its Job Hours and set its Travel Hours once it has arrived; record Measures once
it has arrived; price it once it has left. Each is judged as its Job Action first and the Assignment's state second, and served on every Machine
Assignment of the Job detail beside the Job's own verdicts, so a screen offers a control only when the served
verdict allows it; a refused verdict carries the one sentence that says why. Re-adding a Machine that has left
is the Job's assign action on a new Assignment, not an Assignment Action on the old one.

**Charge Line** is a non-hourly amount on a Job — transport (e.g. a low-bed move), a supplied
part, or a fixed quoted total — a description management writes from Active onward, usually at Completion, with an amount
management may leave blank and Pricing must then set (zero allowed). **Diesel** is not a Charge
Line but a dedicated field on every Job: litres supplied (default zero, set at Completion) and,
when litres are non-zero, a price per litre set at Pricing, from which the amount computes
(editable afterwards, like any line amount); diesel carries no VAT and the Job Card marks it so. A **Discount** is one optional Job-level reduction — a fixed amount
or a percentage of the Assignment amounts and Charge Lines, never of Diesel — applied at Pricing
and shown on the Job Card as its own line.

**Farm** is the place the work happens, scoped to one Customer. Its spelling is kept consistent by
selecting the existing Farm instead of retyping it; different Customers may have Farms with the same name.

**Work Type** is an admin-managed list of kinds of contracted work (dam building, disking,
planting, …), exactly one per Job, set at pre-creation. It is the reporting dimension for future
utilisation views.

**Rate Card** is the list of named **Rates** management maintains and Pricing chooses from —
supervised and unsupervised plant hire, tractor-and-tanker, disking per hectare, … — each with a
**basis**: time (billed per hour of the Assignment's work plus its Travel Hours) or one **Measure
Type** (billed per unit of that Measure recorded on the Assignment). **Measure Type** is the
management-maintained list of production units — hectares, loads, … — in display order; a Measure
on an Assignment names one. Rates hang on nothing but their name: not on a Category, a Machine, or
an Implement. At Pricing every Assignment is given a Rate — or **No charge**, a built-in choice rather than a
Rate, used when a Charge Line carries a fixed quote — and its amount computes from the basis,
editable afterwards; choosing a different Rate discards the edit. Rate Card changes never reach a
Job: a Priced Job holds its snapshot and a Completed one is not yet priced. Until a Job is Priced
nothing stores an amount: the chosen Rates, the Diesel price, the Discount and any typed amount are
kept, every amount derives from them, and Mark as Priced writes the snapshot.

**Invoice Number** is the terminal stamp on a Job, recorded by the invoicing user from the
external accounting system. Stamping it is what makes a Job Invoiced.

**Machine** is one piece of the contracting fleet: a make and model (entered via creatable
selects so spelling stays consistent), a year, a registration number, a hand-entered unique
**Machine Code** following the fleet's `JD140-1` convention, a **Category**, an optional
current **Driver**, notes, and a serial number filled in by its John Deere Link. A Machine is what an
Assignment assigns. It has no reference to the Equipment context: the two businesses share no machine
identity. A Machine is **On Job** while it has an **on-site** Assignment and otherwise **In Yard** — a
planned Assignment never counts — derived, never stored, with no manual flag;
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

**Job Hours** are the arrival and departure meter values on a Machine Assignment, each with an optional
comment, who captured it and when it was captured. One rule holds: departure at or above arrival — equal is
accepted, a Machine delivered and collected unused bills no Work hours. Job Hours carry no Read At, never join the
Hour Reading ledger, and are never compared to another stint or to a reading. They are captured on the phone from
the Job (Start and Stop) and on the web Job page. The Foreman edits his own while the Job is open (Upcoming or
Active); management edits them until the Job is Invoiced, with a mandatory reason once there is a Job Card. An edit on
a Priced Job returns it to Completed for re-pricing, and the internal Job Card marks the stint amended.
_Avoid_: arrival reading, departure reading, stint reading.

**Travel Hours** are a Machine Assignment's billed travel: snapshot when the arrival is captured as the arrival
hours less the Machine's last departure hours on any Job, clamped at 0 — a Machine with no earlier departure, or one
moved by truck, has 0. An arrival edit recomputes them until someone sets them by hand; management sets them until the
Job is Invoiced, and nothing recalculates them after. They are billed at the Assignment's rate. Over the **Travel Flag
threshold** in Settings (4 h unless changed), or clamped from a negative, the stint needs a look.
_Avoid_: Hour Gap, Gap Flag, Unaccounted Interval, Unresolved.

**Hour Reading** is one entry in a Machine's hour-meter ledger: the value, when the meter was read (its **Read At**
time) and by whom. The ledger holds two kinds and nothing else — **spot readings** and **Telematics Readings**. A
spot reading is typed by a person, on the phone at the Machine or on the web Machine page; it exists to keep Known
Hours current for service tracking and reporting, and has no billing effect. Job Hours never join it. An
administrator's first spot reading on a Machine is its baseline; there is no separate kind. Every spot capture form
asks first whether the meter was read **today** or **earlier**, then takes the hours and works out from the
Machine's previous readings when those hours were on the meter: fixed when John Deere's readings bracket them, a
guess when only captured readings do, now when they are at or above the latest; the capturer confirms that date,
correcting it where it is a guess, before anything else is asked. Read At is never in the future. Read At orders the
ledger: the **latest reading** is the one with the latest Read At, and every spot capture is judged against its
**time neighbours** — at or above the nearest reading before its Read At and at or below the nearest reading after
it; one that falls below or above is refused, since the fix is its time or its value. **The meter cannot outrun the
clock**: engine hours between two readings never exceed the wall-clock hours between them (an hour of slack for the
dash and the phone), and a capture that would is refused naming both readings. Capture needs a connection: the
server judges every capture under the Machine lock, and a Foreman without signal keeps a Field Note instead. Every
way a capture is refused is one rule in one ordered table; the phone and the web stop only what that table says the
server would refuse, and show its sentence when it does. A reading may carry the capturer's optional **capture
comment**. Management amends spot readings with a mandatory reason; the amended reading is judged again at its place
in time. Hours are never collected from paper, stickers or memory ahead of use, because a value taken off site has no
known currency.

**Known Hours** is a Machine's best-known meter value: the higher of the ledger's latest reading and the Machine's
latest Job Hours, with its source (John Deere, a spot reading, or a Job) and when. It is what Service Due Soon, the
Services page and Service Record suggestions read. The ledger's own latest reading is still what a spot capture is
judged against and what the John Deere Links compare shows; the two are named differently and never confused.

**Telematics Reading** is an Hour Reading the Machine's own telematics reported rather than a person
captured: its Read At the time the machine reported, its evidence the manufacturer's report, captured by nobody
(the System), never amended. No spot capture may contradict one. One may move its Read At forward when the machine
reports the same value again, so the ledger says the hours stand as of the latest report. A linked Machine's Job
Hours are compared to its latest Telematics Reading: over the **John Deere difference threshold** (Settings, 10 h
unless changed) the capture warns and the stint needs a look; nothing blocks. _Avoid_: telemetry reading,
automatic reading, JDLink reading, API reading.

**Assignment Attention** is everything that flags a Machine Assignment for a person, at one level, **needs a
look** (amber): Travel Hours over the Travel Flag threshold, Travel clamped from a negative, or a John Deere
difference over its threshold. It is counted on the Jobs list and the Dashboard and filtered for, borders nothing
red, and blocks nothing. _Avoid_: bare "attention", alert, issue, critical.

**Field Note** is a generic note a Foreman keeps on his phone — when the app cannot take a capture,
without signal, typically — and later acts on himself: a description, one or more photos, and the
moment it was made. It is **Open** until the Foreman has acted on it and closes it, and may be
reopened; nothing closes it but him. A Field Note lives only on the phone, per signed-in user, and
never reaches the server — save that a Voice Note recorded into its description sends the
recording, and the description saved with it, as that Transcription's. It is not a capture, a queue,
or a task: nothing links a Field Note to a capture, and the app never reads one back into a Job, a
Machine or a reading. Its phone tab is **Field Notes**, never "Notes": a Note is a
Job Note or a Breakdown Note.
_Avoid_: task, to-do, offline capture, queued reading, note

## Workshop

**Breakdown** is one reported problem on one piece of fleet — a Machine **or** an Implement, exactly
one — there is no separate "fault" type; an open Breakdown *is* an outstanding fault. Any user with Contracting access may report one (usually the
Foreman): photos,
a description in the reporter's own words (typed, or a transcribed voice note the reporter can
edit), an optional link to the Job it happened on (defaulted from the subject's on-site
Assignment — for an Implement, the Assignment it is attached to — which is what locates it for the
workshop and puts it in the same-Job dispatch cross-reference), optional GPS, and an **urgency** — **Code Red**
(machine down) or **Code Green** (still working). Status runs **Not fixed → Fixing → Fixed** (stored as `open` / `in-progress` / `solved`); the workshop manager owns every
transition — **Start work** moves it to Fixing, **Mark completed** to Fixed — and closes with a mandatory
close-out note. The subject's Breakdown history is
permanent. The dispatch cross-reference — other fleet on the same Job with open Breakdowns —
is derived, never stored. A new Breakdown notifies by push notification: Code Green reaches
the workshop-manager role; Code Red also reaches contracting-manager, contracting-admin and
super-admin. The reporter never receives their own ping. A Breakdown changed from Code Green to Code Red
notifies as Code Red again ("Now Code Red"), excluding whoever changed it; a change back to Code Green is
silent. Anyone may mute a Push Kind in App Settings (see [GLOSSARY-MAP.md](GLOSSARY-MAP.md)).

**Breakdown Note** is one entry in a Breakdown's Note Thread. Whoever may update Breakdowns may add one to
any Breakdown, and whoever may report them may add one to a Breakdown that is theirs — reported by them or
on their Job — in every status. Its participants are the Breakdown's reporter, the Foreman of its Job,
everyone who has noted it, and the workshop-manager role. Contracting's own mechanism — never the
Equipment context's Feedback.
_Avoid_: comment, message, chat message

**Mechanic** is a non-login user record, like Driver: mechanics take instructions and never sign
in. Exactly one primary Mechanic — a Mechanic record or a holder of the workshop-manager role — is
assigned per Breakdown by the workshop manager, possibly himself; a second body on site is never
recorded. Mechanic performance — report-to-Solved time — is derived, never stored.

**Service Record** is the light digital counterpart of the paper service book, which stays the
detailed record for now: one service on one Machine — start and end date, the hour reading at
service, the primary Mechanic (from the same set as a Breakdown's), and free-text notes. A Service
is a recurring, expected event and deliberately not a Breakdown. **Closing a Service Record requires
setting the Machine's Next Service Due** — the number the mechanic prints on the dash sticker at that moment; the Machine's
optional **Service Interval** only pre-fills it from the reading at service. **Service Due Soon** is the derived flag raised when the Machine's Known Hours
come within the Machine's **Service Alert Hours** of Next Service Due — its own value, or the
**Service Due Soon threshold** in Settings (100 h unless changed) when it has none — kept honest mid-job by Job Hours, spot
readings from the field and Telematics Readings. It notifies the workshop-manager, contracting-manager, contracting-admin and super-admin
roles by push notification once, at the
capture or Telematics Reading that first brings Known Hours within the threshold; closing a Service Record moves the
due point on and re-arms it.

**Due for Service** is a derived state: a Machine whose Service Due Soon status is due soon or overdue and
which has no open Service Record. **Booked In** is a Machine with an open Service Record; booking a Machine
in takes it off the due list before its hours change, and closing the record with a new Next Service Due
resets its status. The Services page and the Dashboard read this one predicate, and no filter on the
Services page can hide a Machine Due for Service. Nobody reports that a service is due: a spot reading
that brings the hours within the threshold is the report.
_Avoid_: service notification, service request (the push is "Service Due Soon")

## Voice

**Voice Note**, **Transcription**, **Transcription Hint** and **Keyterm** are the shared Voice Note
mechanism defined in [GLOSSARY-MAP.md](GLOSSARY-MAP.md). Contracting's part of it:

- Every multi-line text field of the Contracting mobile app takes a Voice Note.
- Contracting's **Keyterms**, after its taught Transcription Hints, are Machine codes, makes and
  models, Implement codes, Categories, the names of drivers, mechanics, workshop managers and
  foremen, and the Farms and Customers on Jobs updated in the last 90 days.
- Contracting's notes are tidied as voice notes "from a South African farm or workshop".
- `contracting_transcription:use` is held by contracting-admin, contracting-manager, workshop-manager,
  foreman and super-admin; the Transcriptions page's `contracting_transcription:read` is described
  under Access.

## Access

A user's contracting role fills one of the two role slots defined in
[GLOSSARY-MAP.md](GLOSSARY-MAP.md); holding one is what grants Jedidiah Contracting access at all.
The Users page in Contracting mode lists the people holding a contracting role (and the spanning
super-admin) and assigns only contracting roles; it needs `user:list`, which no contracting role
holds, so in practice a super-admin runs it. Server-side checks are the security boundary; browser
checks are UX only.

- **contracting-admin**: every contracting permission the spanning super-admin has — Pricing,
  the Rate Card, fleet, invoice stamping, all of it — without user administration and without any
  Equipment reach.
- **contracting-manager**: all operations — Job create/edit/assign/complete/cancel, Job Hours and
  spot reading amendments, Travel Hours, breakdowns and servicing, fleet management — but no Pricing and
  no Rate Card; sees priced amounts.
- **workshop-manager**: reads everything contracting; writes Breakdowns (mechanic assignment,
  transitions, close-out) and Servicing (records, interval and due fields); reports Breakdowns.
- **foreman**: sees only Jobs assigned to him; manages his own Assignments and captures Job Hours and spot readings;
  reports Breakdowns; never sees money — no rates and no priced amounts.
- **contracting-invoicing**: reads Priced and Completed Job Cards and stamps the Invoice Number;
  nothing else.

The Contracting **Audit Log** shows the Audit Events of Contracting records — Categories, Machines,
Implements, Hour Readings, Customers, Farms, Work Types — and of Users who hold a Contracting role and
no Equipment role, under `contracting_audit:read`, which contracting-admin and super-admin hold.

The **Transcriptions** page shows every user's Transcriptions, the Transcription Hints and the prompts
the models are sent, read-only, under `contracting_transcription:read`, which contracting-admin and
super-admin hold; it shows everyone's Voice Note text, so it stays this narrow.

Drivers and Mechanics are non-login user records holding permissionless contracting roles. Pricing
and the Rate Card deliberately sit with contracting-admin and super-admin alone; foremen are
money-blind by design.

**Settings** is the one row of Contracting-wide values management edits on the web: the Travel Flag
threshold, the John Deere difference threshold, the Service Due Soon threshold (which a Machine's Service Alert Hours may override) and the
Utilisation Target %. Every derived read takes the
current value; nothing stored is re-judged.

**John Deere Connection** is Contracting's one link to the owner's John Deere Operations Center
organization, made and renewed by an administrator on the John Deere tab of Settings with the owner's John
Deere sign-in, and the only way Telematics Readings reach the fleet. It is Connected, Needs reconnecting, or
Not connected. **John Deere Link** pairs one Machine with one machine in that organization, made on the same tab by
comparing the two meters, and starts the Machine's feed; a Link is **lost** while the organization no longer lists
its machine. Unlinking stops the feed and keeps every reading. _Avoid_: integration, sync, JDLink connection.

The **Dashboard** is the web home: counts and lists of what needs a person now — the Jobs needing a look, the
Breakdowns not yet Fixed, the Machines Due for Service, the Jobs waiting for sign-off, pricing or an
Invoice Number — and two counts of what is under way: the Active Jobs not yet looking
finished and the Machines On Job. Each block shows only to a role holding the permission that reads what
it lists, and it refreshes every minute. Apart from the Daily Hours heat map, a trailing six-month card for the roles that read reports, it never shows anything over a period; that is Reporting's.

## Activity

**Activity** is the cross-Job feed of what has happened and what has been said across Jobs and
Breakdowns, newest first — the phone's first tab and a web page under the Dashboard. An **activity
item** is one entry in it, in one of four filter categories: **Notes** (Job Notes and Breakdown Notes),
**Breakdowns** (reported, Mechanic assigned, fixing started, fixed), **Jobs** (started — the first
arrival on it — completed, cancelled) and **Hours** (a Machine arriving on site and leaving, each with
its Job Hours). Every item is one stored record read as itself; the feed stores nothing of its own and
reads no Audit Event (ADR 0023). A person sees exactly the items on the Jobs and Breakdowns their reach
already shows them — a Foreman his own Jobs and his own Breakdowns, workshop-manager and up everything;
contracting-invoicing has none. Spot readings, amendments, Upcoming, Priced,
Invoiced, reopening, Measures, Charge Lines, photos, report edits, Service Records, Service Due Soon
and Field Notes are not Activity. A Job's own Activity is everything on it, its Breakdowns included; a
Breakdown's is only its own. Across contexts, say **Contracting Activity**; Equipment's is Job Activity.
_Avoid_: timeline, history, feed (as a noun for the whole), chat, log

**Activity View** is the per-user, per-business high-water mark of Activity: the occurrence time of the
newest item that user has received in the unfiltered feed. An item newer than it is **Unread Activity**,
which badges the phone tab and dots the web nav item. A client advances the mark only to the newest item
it displayed, and only from the unfiltered, unsearched, unscoped view — never from one Job's or one
Breakdown's own thread. The two businesses' marks are independent (see [GLOSSARY-MAP.md](GLOSSARY-MAP.md)).

## Reporting

An **Active Day** is a calendar day inside a Job's dates — its stored Start and End, else from its first arrival's
capture to its last departure's, an open Job running to today — for a Machine with an arrival on that Job (planned
stints never count). **Utilisation %**
is active days over days in the window, counting only days the Machine was in the fleet — days,
never hours, and month attribution is exact. **Fleet Load** is the share of Machines with at
least one Active Day in the window. **Utilisation Target %** is the single global reference line
management sets in Settings; empty draws no line. **Hour totals by kind** are a Machine's **Work** and **Travel**
hours from its stints' Job Hours and Travel Hours, spread evenly over each Job's dates. Mechanic performance — Solved count, average
report-to-Solved time in days, Not solved count — is derived from Breakdowns over the window (Not solved
ignores it) and never stored; **Solved** counts the `solved` status the Workshop shows as Fixed. Reporting is
readable by every role that reads all Jobs; Foremen and invoicing never see it.

**Daily Hours** are a Machine's meter hours attributed to one plant-date day. Per Machine they come from the
ledger alone — consecutive spot and Telematics Readings, spread across the days between them by elapsed time, so two
readings three days apart average out over the three days and a Telematics Reading logged hourly is exact; an
unlinked Machine with no spot readings shows none. Under a Job they come from its stints' Job Hours, spread evenly
over the Job's dates and all estimated. A day is **estimated** when its hours come from a reading pair spanning
more than one plant day or from a Job's spread. The web shows them as a heat map, a cell per day shaded
by quarters of the busiest day, on the Machine page, the Job page and the Dashboard, for the roles that read
reports. _Avoid_: utilisation heat map (Utilisation % counts Active Days, never hours), usage, activity (Activity is the feed)
