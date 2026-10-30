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
Contracting Manager's sign-off, reachable only once every Assignment has left and every Gap Flag
is resolved: work confirmed done, Charge Lines and notes added, final start and end dates stamped
— suggested from the earliest arrival and latest departure **Read At** times, never from when they were accepted, tweakable), **Priced**
(rates applied and frozen as a snapshot — diesel litres and travel lock with it; a reading amendment reopens the Job to Completed for
re-pricing — the chosen Rates and their snapshotted unit amounts stay, line amounts recompute from
the amended hours, and manual amount edits are discarded), and **Invoiced** (the invoice number stamped; the wall — after it, nothing moves). There is no "submitted" status: foremen never close Jobs; a
Job whose machines have all stopped surfaces in the Contracting Manager's queue as looking
finished. Every stage has a visible queue, so work cannot vanish between a foreman's phone and
the invoice — that chain is the app's core promise.

**Machine Assignment** is one Machine's stint on one Job. Management may plan it when setting
the Job up — machine and Implement chosen ahead of arrival, a **planned** Assignment — or the
Foreman adds it from the phone, planned until the Machine arrives; either way it becomes **on site** when its arrival Hour Reading is
captured and **left** when its departure is. A Machine may have **several sequential Assignments
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
under the Jedidiah Contracting letterhead, in two variants: **internal**, carrying evidence
markers, gap resolutions, capture comments, and attribution; and the **customer copy**, the clean
dispute trail of readings and amounts that shows **one total hours figure per line — never the
work/travel split**. Reading values print; meter photos stay in the app. Diesel is shown
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
change its setup, Foreman, Machine Assignments, travel, Measures, Charge Lines and their amounts, Hour Gaps,
sign-off details and diesel litres; complete, cancel, price or stamp it; amend its readings; capture on it.
They are computed, never stored, and judged for the person asking — a Foreman works only his own Jobs, while
open — and they are the same answer the server's write gates apply, so a screen shows a control
when its verdict allows it and hides it when the person lacks the permission. Both the web and the phone read
the verdicts the server serves; no surface derives its own. A refused verdict carries the
one sentence that says why; the server's refusal and the screen show that sentence. Invoiced and Cancelled
are both closed: no Job Action is open on either. A check that judges what a write carries rather than the
Job — the Mark as Priced gate, the invoice total, a departure reading without a photo — is not a Job Action
and stays with the write that reads that input.

**Assignment Actions** are the verdicts of what one person may do to one Machine Assignment now: remove it
while planned; change its Implement and Driver until it has left; capture its arrival while planned and its
departure while on site; record Measures once it has arrived; resolve its Hour Gap and price it once it has
left. Each is judged as its Job Action first and the Assignment's state second, and served on every Machine
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
**basis**: time (billed per hour of the Assignment's work plus included travel) or one **Measure
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

**Hour Reading** is one captured value of a Machine's hour meter: the value, when the meter was
read (its **Read At** time) and by whom, and its evidence. Whoever captures it types the value —
the Foreman in the field, an administrator for a Baseline Reading — or the Machine's telematics reports
it (a Telematics Reading); a photo is attached whenever
the camera allows, taken on the spot or chosen from the phone's gallery, and a reading without
one is stamped **Missing Photo Evidence**. Read At defaults to when a chosen photo says it was
taken, and otherwise to the moment of capture — a photo with no usable time, or one whose time
lies in the future, is still accepted and defaults to that moment; every capture form asks first whether
the meter is being read **now** or was read **earlier**, and a value that falls below John Deere's readings
has the form propose the moment John Deere puts it at, which the capturer confirms or corrects before
anything is saved. It is never in the future. Gallery photos and Read At correction are phone affordances,
and every web capture offers both from a photo chosen on disk. Read At orders a Machine's readings:
the **latest reading** is the one with the latest Read At, and every capture is judged against its
**time neighbours** — it must be at or above the nearest reading before its Read At and at or below
the nearest reading after it. A late-entered reading takes its place in time, so a departure dated
yesterday lands behind today's readings. An Hour Gap reads the two readings its Assignments name, so
a backdated Read At moves no hour between Jobs; for the same reason a Machine's stints stay in time
order — no arrival is dated before its last departure, no departure before its own arrival. Capture
needs a connection: the server judges every capture as the ledger's truth, and a Foreman without
signal keeps a Field Note instead. Every way a capture is refused is one rule in one ordered table,
judged under the Machine lock; the phone and the web stop only what that table says the server would
refuse, and show its sentence when it does. Once a capture has landed the server reads
the photo itself and records its own value and confidence as the System, so capturing never waits on it; a check
that fails leaves the reading pending until Re-verify or the API's next start-up checks it again. A reading is
**photo-backed** when it
carries a photo and **AI-verified** when the server's read agrees with the typed value.
Disagreements, low confidence, and disputes surface to management as **Reading Exceptions** — a
reading is **Disputed** when it belongs to an unresolved out-of-sequence pair or a Telematics Reading
contradicts it, and **AI flagged**
when its verification is pending, disagrees, or has low confidence and has not been reviewed. Only
a disagreement or low confidence puts an AI flagged reading on the list: a pending verification is
only a notice. A reading can carry both exception types. Exceptions never return to the Foreman, who is never
re-interrupted in the field. A reading may carry the Foreman's
optional **capture comment**, shown wherever management reviews it; the capture screen shows the
minimum value the meter can now read. A field reading plays one of three roles:
**arrival** (machine on site) and **departure** (machine leaving) on a Machine Assignment, or
**spot** — an ad-hoc capture with no billing effect, existing to keep a Machine's known
hours current for service tracking, taken on the phone at the Machine or on the web Machine page from
a photo of its meter; the fourth role, **Baseline Reading**, is defined below. The
pre-travel opening is never captured: it is the machine's previous departure reading, so travel
and work time are derived and no hour can vanish between Jobs. A capture strictly below the
Machine's latest reading is refused (equal is accepted — an idle machine reads its departure value),
unless the Foreman asserts the latest reading is wrong, which saves his value as disputed and flags
the pair for management; a backdated capture that falls below or above its neighbours is refused
outright, since the fix is its time or its value. No capture may contradict a Telematics Reading.
**The meter cannot outrun the clock**: engine hours between two readings never exceed the wall-clock hours
between them (an hour of slack for the dash and the phone), and a capture that would is refused naming both
readings, since the fix is a Read At on one of them.
The Foreman may re-capture a reading only while his Assignment is open; from Completion onward only management
amends, with a mandatory reason — an amendment corrects the value or Read At or both, and the amended reading is judged again at
its place in time by the capture rules, so stints stay in time order, and engine hours between it and either neighbour
never exceed the wall-clock hours between them (an hour of slack for the dash and the phone); an amendment on a Priced Job returns it to Completed for
re-pricing, and Invoiced freezes everything. Derived values always recompute after an amendment.

**Baseline Reading** is an optional, administrator-captured Hour Reading that anchors a Machine
before its first Job — at a service, say — and must be the Machine's first reading. Most Machines
never get one: hours are captured on site, with a photo, the first time the app sees the Machine,
and that first reading of whatever role opens its ledger. Hours are never collected from paper,
stickers or memory ahead of use, because a value taken off site has no known currency. Until a
Machine has a reading nothing derives for it — no Hour Gap, no Travel Hours, no Service Due Soon.

**Telematics Reading** is an Hour Reading the Machine's own telematics reported rather than a person
captured: role spot, its Read At the time the machine reported, its evidence the manufacturer's report,
captured by nobody (the System). It is beyond dispute — never Disputed, never AI flagged, never Missing
Photo Evidence, never amended — and a captured reading it contradicts is the one that becomes Disputed for
management, who correct its hours or Read At back into sequence. One may move its Read At forward when the machine reports the
same value again, so the ledger says the hours stand as of the latest report. _Avoid_: telemetry reading,
automatic reading, JDLink reading, API reading.

**Hour Gap** is the derived interval between one Assignment's departure reading and the machine's
next arrival reading; spot readings never bound a gap, and a Machine's first arrival has no
preceding departure, so it opens the ledger with no gap and no Travel Hours. By default the whole gap is **Travel Hours**, billed to the destination Job
at the Assignment's rate under an include toggle that defaults on; a machine moved by truck simply
has a zero gap. A gap above the **Gap Flag threshold** in Settings (4 h unless changed) raises a **Gap Flag**, surfaced at
sign-off and blocking nothing in the field — the Job cannot be Completed while one is open;
management resolves it by splitting the gap into billable Travel
Hours and an **Unaccounted Interval** with a mandatory reason, which clears the flag. Time in the
yard is an Unaccounted Interval — there are no internal Jobs. An unresolved gap over the threshold
reports its hours as **Unresolved** until management splits it.

**Assignment Attention** is everything that flags a Machine Assignment for a person, each kind at one
of three levels: a **notice** is worth knowing with nothing to do (a pending AI verification, Missing
Photo Evidence); a **warning** means the evidence does not confirm the value and someone should review
it (AI value differs, AI confidence low); **critical** means the hours are wrong or contradictory, or
it stops the Job moving on (an open Gap Flag, a Disputed reading). Warning and critical **need a
look** — they are counted on the Jobs list, filtered for, and border the Assignment's card — while a
notice never does. Each level has one colour everywhere: notice purple, warning orange, critical red.
_Avoid_: bare "attention", alert, issue

**Field Note** is evidence a Foreman keeps on his phone when the app cannot take a capture —
without signal, typically — for entry once it can: a description, one or more photos, and the
moment it was made. It is **Open** until the Foreman has entered what it holds and closes it, and
may be reopened; nothing closes it but him. A Field Note lives only on the phone, per signed-in
user, and never reaches the server — save that a Voice Note recorded into its description sends the
recording, and the description saved with it, as that Transcription's; its photos are also saved to the phone's gallery, which is
where a later capture picks them up. It is not a capture, a queue, or a task: the app never reads
a Field Note back into a Job or a Machine. Its phone tab is **Field Notes**, never "Notes": a Note is a
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
super-admin. The reporter never receives their own ping, and anyone may mute a Push Kind in App
Settings (see [GLOSSARY-MAP.md](GLOSSARY-MAP.md)).

**Breakdown Note** is one entry in a Breakdown's Note Thread. Whoever may update Breakdowns may add one to
any Breakdown, and whoever may report them may add one to a Breakdown that is theirs — reported by them or
on their Job — in every status. Its participants are the Breakdown's reporter, the Foreman of its Job,
everyone who has noted it, and the workshop-manager role. Contracting's own mechanism — never the
Equipment context's Feedback.
_Avoid_: comment, message, chat message

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
known Hour Reading comes within the Machine's **Service Alert Hours** of Next Service Due — its own value, or the
**Service Due Soon threshold** in Settings (100 h unless changed) when it has none — kept honest mid-job by spot
readings from the field and by Telematics Readings. It notifies the workshop-manager, contracting-manager, contracting-admin and super-admin
roles by push notification once, at the
capture or Telematics Reading that first brings the reading within the threshold; closing a Service Record moves the
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
  models, Implement codes, Categories, the names of drivers, mechanics and foremen, and the Farms and
  Customers on Jobs updated in the last 90 days.
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
- **contracting-manager**: all operations — Job create/edit/assign/complete/cancel, reading
  amendments and gap resolution, breakdowns and servicing, fleet management — but no Pricing and
  no Rate Card; sees priced amounts.
- **workshop-manager**: reads everything contracting; writes Breakdowns (mechanic assignment,
  transitions, close-out) and Servicing (records, interval and due fields); reports Breakdowns.
- **foreman**: sees only Jobs assigned to him; manages his own Assignments and captures readings;
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

**Settings** is the one row of Contracting-wide values management edits on the web: the Gap Flag
threshold, the Service Due Soon threshold (which a Machine's Service Alert Hours may override) and the
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
Invoice Number, and the Reading Exceptions — and two counts of what is under way: the Active Jobs not yet looking
finished and the Machines On Job. Each block shows only to a role holding the permission that reads what
it lists, and it refreshes every minute. Apart from the Daily Hours heat map, a trailing six-month card for the roles that read reports, it never shows anything over a period; that is Reporting's.

## Activity

**Activity** is the cross-Job feed of what has happened and what has been said across Jobs and
Breakdowns, newest first — the phone's first tab and a web page under the Dashboard. An **activity
item** is one entry in it, in one of four filter categories: **Notes** (Job Notes and Breakdown Notes),
**Breakdowns** (reported, Mechanic assigned, fixing started, fixed), **Jobs** (started — the first
arrival on it — completed, cancelled) and **Hours** (a Machine arriving on site and leaving, each with
its reading). Every item is one stored record read as itself; the feed stores nothing of its own and
reads no Audit Event (ADR 0023). A person sees exactly the items on the Jobs and Breakdowns their reach
already shows them — a Foreman his own Jobs and his own Breakdowns, workshop-manager and up everything;
contracting-invoicing has none. Spot and Baseline readings, amendments, disputes, Upcoming, Priced,
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

An **Active Day** is a calendar day on which a Machine had an on-site Assignment (planned stints
never count). **Utilisation %**
is active days over days in the window, counting only days the Machine was in the fleet — days,
never hours, and month attribution is exact. **Fleet Load** is the share of Machines with at
least one Active Day in the window. **Utilisation Target %** is the single global reference line
management sets in Settings; empty draws no line. **Hour totals by kind** are a Machine's meter hours
in a window as **Work** (inside a stint), **Travel** and **Unaccounted** (its Hour Gaps, as resolved
or, under the threshold, all travel) and **Unresolved**, derived from consecutive readings — spot
readings included — and spread across months by elapsed time; hours before a Machine's first arrival
and in a gap no arrival has closed count nowhere (**Daily Hours** count them). Mechanic performance — Solved count, average
report-to-Solved time in days, Not solved count — is derived from Breakdowns over the window (Not solved
ignores it) and never stored; **Solved** counts the `solved` status the Workshop shows as Fixed. Reporting is
readable by every role that reads all Jobs; Foremen and invoicing never see it.

**Daily Hours** are a Machine's meter hours attributed to one plant-date day, derived from consecutive Hour
Readings and spread across the days between them by elapsed time, so two photo readings three days apart average
out over the three days and a Telematics Reading logged hourly is exact. Unfiltered and per Machine they count every
positive meter delta whatever the phase (yard time and hours before a first arrival included, which the Hour totals
by kind drop); under a Job they count only Work hours inside that Job's stints, an open stint running to the
Machine's latest reading. A disputed pair that runs backwards counts nothing. A day is **estimated** when its hours
come from a reading pair spanning more than one plant day. The web shows them as a heat map, a cell per day shaded
by quarters of the busiest day, on the Machine page, the Job page and the Dashboard, for the roles that read
reports. _Avoid_: utilisation heat map (Utilisation % counts Active Days, never hours), usage, activity (Activity is the feed)
