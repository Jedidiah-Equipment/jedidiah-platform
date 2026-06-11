# Jedidah Ops

Domain language for Jedidah Ops. The core unit is a **Job**: one physical product instance scheduled across the Bays of a five-Department manufacturing pipeline.

## Language

**Job**:
The realized build of an accepted Quote — the confirmed order behind it. A Job is always sourced from exactly one Quote; there is no way to create a Job without one. Creating a Job locks the Quote's commercial facts, assigns the physical Product Serial Number for the unit being built, snapshots its bill of materials, and may manually seed Work Slots onto Bays (see Create Job from Quote and CFO). A Job has no Stage rows; its presence in a Department is emergent — it appears in a Department only while it has a Slot on one of that Department's Bays.
_Avoid_: Order, Work Order, Build, Ticket.

**Product Serial Number**:
The physical unit serial assigned to one Job at creation, formatted as `{productModelCode}{twoDigitYear}{sequence}` (for example `SG1836260009`). The prefix is the Product model code as stored when the Job is created; the year is the Africa/Johannesburg business calendar year; and the sequence is a per-Product running count that continues across years. This is not the Job code: the Job code (`JOB-xxxxx`) remains the app-facing operational identifier, while the Product Serial Number identifies the real product unit.

**Pipeline**:
The fixed Department ordering: Procurement -> Supply -> Fabrication -> Paint -> Assembly. It is for visual ordering and shared language only — it is not a server-side work gate and is not materialized as any per-Job row. It survives purely as the order in which Departments (and their Bays/Slots) are grouped on Job and schedule surfaces.
_Avoid_: Stage sequence, Step, Phase.

**Department**:
One of the five fixed manufacturing functions (Procurement, Supply, Fabrication, Paint, Assembly). A Department owns zero or more Bays. A Job has no per-Department record of its own; it relates to a Department only through the Slots it has on that Department's Bays. A Department is not an authorization axis — access is dictated by App Role alone (see Department Membership).

**Department Membership**:
The descriptive association of a User with zero or more Departments — which part of the shop the person works in. It is an organizational fact only: membership never grants, scopes, or restricts any capability. Any User may hold memberships regardless of App Role; an empty set simply means no Department is recorded.
_Avoid_: Department access, department scope, scoped role, Department-Aware role.

**Bay**:
A durable physical workspace that belongs to exactly one Department (for example a Fabrication bay). A Department has zero or more Bays. At most one Bay Operator is attached to a Bay at a time (see Operator Assignment). Bays are the resources that Jobs are scheduled onto: each Bay holds an ordered queue of Slots from a fixed `scheduleOrigin`. Bays are admin-managed (created, renamed, disabled — see Disabled Bay); a Bay's Department is fixed at creation and never changes. A Slot's Department is simply its Bay's Department — there is no separate match check.
_Avoid_: Station, Workstation, Cell, Machine.

**Disabled Bay**:
A Bay an admin has soft-retired by setting `disabledAt`. A Disabled Bay is hidden from new selection (the Create Job form's Bay picker and the Product Bays picker) and accepts no new bookings, but its existing Slots remain and still project on the schedule chart, and it can be re-enabled. Bays are never hard-deleted — disabling is the only retirement path, which preserves the retired Bay's existing Slots and schedule history and stays reversible (removing individual Slots is a separate, intended schedule mutation). A Product Bay pointing at a now-Disabled Bay is shown as disabled (and removable) in the Product editor. Disabling does not touch the Bay's Operator Assignment — the current Bay Operator stays attached — but a Disabled Bay accepts no new Operator Assignment (unassigning remains allowed).
_Avoid_: Deleted bay, archived bay, closed bay.

**Bay Operator**:
A User holding the `bay-operator` App Role — the personnel category for shop-floor workers who are attached to Bays. A Bay Operator holds no App Permissions and therefore cannot sign in (see Access). Only Bay Operators may be attached to Bays; changing the role of a user currently attached to any Bay is blocked until they are unassigned.
_Avoid_: Worker, Technician, Staff, Artisan, Operator (unqualified).

**Operator Assignment**:
The attachment of one Bay Operator to one Bay, from an assignment moment until unassigned. A Bay has at most one current Bay Operator; one Bay Operator may hold several Bays at once. There is no Department match check — the Bay's own Department is the operative fact. Assignment history is first-class domain data kept beyond the Audit log: the current operator is simply the assignment not yet ended. Assigning and unassigning is admin Bay configuration (the same authority that creates and disables Bays), not day-to-day scheduling. The current operator displays wherever the Bay does; the history timeline is an admin Bay surface.
_Avoid_: Allocation, crew, staffing, operator booking.

**Product Bay**:
A (Bay, default working-days) entry configured on a Product. A Product may have zero or more, including several in the same Department; each names one enabled Bay and a positive default working-days count. Configuring them is optional and is a scheduling convenience only; Create Job prefill uses enabled Product Bays as editable Bay Seed rows. Product Bays are deliberately decoupled from the Product's `buildTimeDays` (the customer-facing quote lead time): the sum of default working-days is not required to equal `buildTimeDays`, and neither is derived from the other.
_Avoid_: Default station, build plan, routing.

**Bay Queue**:
The ordered, non-overlapping sequence of Slots a Bay holds from its fixed `scheduleOrigin`. Slot positions are contiguous (no sequence gaps); appending after the queue has gone idle auto-inserts an Idle Slot covering the working-day gap up to today; a Disabled Bay's queue refuses appends (no new bookings) while existing Slots stay reorderable, resizable, and removable. All queue mutations serialize on the Bay — the Bay row is the single lock for sequence changes. Slot reorders are the only audited queue mutation (under `job_bay`, as before/after slot order).
_Avoid_: Schedule (for the per-Bay sequence), timeline, slot list.

**Slot**:
A single whole-day planning block in one Bay's queue. A Slot is either a **Work Slot**, which books one Job onto the Bay, or an **Idle Slot**, which reserves Bay time without a Job. A Bay's Slots are sequential and never overlap. The same Job may occupy more than one Work Slot on the same Bay (e.g. work stops and later restarts). A Slot's calendar dates are not its source of truth — they are derived by projecting the Bay's queue forward (see Slot Projection). Slots store queue position and `durationDays`, not start/end dates or minute-level planning. A Slot's `durationDays` counts **working days**, not calendar days: Slot Projection skips the Bay's Off-Days when laying the Slot on the calendar (see Working Calendar), so a Slot can span an Off-Day on the chart.
_Avoid_: Booking, Reservation, Appointment, Block.

**Idle Slot**:
A Slot that intentionally represents downtime in a Bay queue — a working day deliberately left empty, distinct from an Off-Day, which is a non-working date stepped over. It has no Job, advances Slot Projection exactly like a Work Slot (its `durationDays` counts working days and skips Off-Days), and is rendered differently from booked Job work on the schedule chart. Idle Slots may have a nullable label; a missing label displays as the domain default `Idle`. Idle Slots can be created automatically when booking work after the queue has gone idle (the gap filled is the count of **working days** between the queue's end and today, never raw calendar days), or manually from a slot context menu (`Add idle slot before` / `Add idle slot after`). Adjacent Idle Slots are valid and are not automatically merged; planners can remove and resize them manually. Idle is reserved Bay time: an Insert-at-Date booking landing inside an Idle Slot splits it exactly like a Work Slot — both halves keep the label and their working days sum to the original — it is never silently consumed or shrunk.
_Avoid_: Hidden buffer, gap, pause.

**Work Slot**:
A Slot that books one Job onto a Bay, referencing the Job directly (there is no intervening Stage). Work Slots display by Job code on the schedule chart. The Slot's Department is whatever its Bay's Department is; a Job may be booked onto any Bay in any Department with no match validation. The same Job may hold several Work Slots, including several in the same Department or on the same Bay.
_Avoid_: Booking, Reservation, Appointment, Stage booking.

**Slot Projection**:
The read-time computation that turns a Bay's queue of Slots into concrete calendar dates. It walks the Bay's Slots in queue order from the Bay's fixed anchor (`scheduleOrigin`), consuming each Slot's `durationDays` as **working days** and skipping the Bay's Off-Days per the Working Calendar: the first Slot starts on the anchor's first working day, each later Slot starts on the next working day after the previous one ends, and a Slot's working days may straddle Off-Days. Dates are never stored on a Slot — only sequence, kind, duration, and Slot-specific references/labels are. Because dates are derived, resizing or removing a Slot, or changing which dates are Off-Days, naturally reflows everything after it. Idle time inside the queue is represented by Idle Slots, never by moving `scheduleOrigin` or silently flooring the whole projection to today; Off-Days (weekends, holidays, shutdowns) are not Idle Slots — they are non-working dates the projection steps over.

**Insert at Date**:
Booking a Job onto a Bay with a picked start date instead of the default append. The picked date is a **placement hint, never stored** (ADR-0042): at booking time, under the Bay lock, it is resolved against the live Slot Projection into a Bay Queue position. A date strictly inside an existing Slot splits it (Work and Idle alike, preserving the Job or Idle label and the total working days across the halves) and pushes everything after later; a date exactly on a Slot's projected start inserts cleanly before it; the Bay's next available day is a plain append. Honest positions only: the earliest pick is tomorrow (the Slot projected over today is never disturbed), the latest is the Bay's next available day, and a date that became unreachable because the queue shrank clamps to append — work starts earlier than picked, never later behind machine-made idle. Deliberate deferral past the queue end is expressed by placing Idle Slots, never by a date pick.
_Avoid_: Pinned date, fixed start, scheduled date, anchored slot.

**Working Calendar**:
The explicit record of which calendar dates are working versus off for Bay scheduling. It is concrete dated facts, never an inferred recurring rule: an **unmarked date is a working day**, and **Off-Days** are marked explicitly. Marks are layered and the most specific wins — a per-Bay **Bay Calendar Exception** overrides an org-wide mark for one Bay, and an org-wide mark overrides the unmarked working default (Bay over org over default). Slot Projection consults the Working Calendar to skip Off-Days, so Slot durations are counted in working days. Because the calendar is explicit dated facts rather than a live rule, changing how *future* dates are marked never moves the projected dates of days already marked — it cannot rewrite schedule history. The calendar is maintained forward by an admin; a Bay whose projected queue runs past the maintained horizon is surfaced as a warning rather than silently assumed to be all working days.
_Avoid_: Work week, schedule rule, shift pattern, roster.

**Off-Day**:
A calendar date explicitly marked as non-working, which Slot Projection skips so no Slot consumes it. It is a single primitive carrying an optional reason label (e.g. "Day of Reconciliation", "December shutdown"); the three sources — the unworked part of the week, public holidays (Africa/Johannesburg business calendar), and general shutdowns — are not distinct types but the same Off-Day with a different label. Each Off-Day is tracked as its own per-date record; there are no ranges — a multi-day shutdown is several individual Off-Days that share a label, so any single day can be flipped without splitting a range, and the calendar is always a single per-date lookup. Org-wide Off-Days are admin-managed. There is no recurring weekend rule — each Off-Day is an explicit mark, which is exactly what lets an irregular work week (e.g. a worked first Saturday, an unworked last Friday) be represented faithfully. An org-wide Off-Day applies to every Bay unless a Bay Calendar Exception overrides it. An Off-Day is not an Idle Slot: idle is a working day deliberately left empty, whereas an Off-Day is a non-working date stepped over entirely.
_Avoid_: Holiday flag, non-working rule, closed rule, weekend.

**Bay Calendar Exception**:
A per-Bay, whole-day mark that overrides the org Working Calendar for one Bay on a specific date, beating the org-wide mark (most-specific-wins). There is no sub-day/hours granularity — a date is working or not for that Bay. It has two directions: **Overtime** opens an otherwise Off-Day as a working day for that Bay, and a **Bay Closure** marks an otherwise-working date as off for that Bay. So one Bay can work a public holiday, or sit out an ordinary working day, without affecting any other Bay. A Bay Calendar Exception is editable by whoever can schedule Bays (the same permission that books Slots).
_Avoid_: Override, special day, one-off.

**Overtime**:
A Bay Calendar Exception that opens an otherwise Off-Day (a weekend, holiday, or shutdown date) as a working day for one Bay. Overtime adds a working day to that Bay's calendar; it does **not** pin any Job to the date. The Bay's Slot queue simply flows into the newly opened day — whichever Slot sits at the projection cursor consumes it — consistent with Slot dates being derived, never stored. To make a specific Job run on an opened day, a planner arranges the queue so that Slot is at the cursor, not by attaching the Job to the date.
_Avoid_: Extra shift, pinned Saturday work, scheduled overtime job.

**CFO (Customer Fabrication Order)**:
The frozen bill of materials for a Job, snapshotted from the Quote's Effective Bill of Materials at the moment the Job is created. It captures the Standard and selected Optional Assemblies (Standards overridden by a selected Optional are excluded) and their Parts. Parts are referenced by id rather than copied: the reference always resolves because Parts are never deleted, and the dump deliberately reflects each Part's *current* code and name — so editing or renaming a Part is intentionally allowed to change how an existing CFO reads. The CFO is the shop-floor build instruction for that one physical unit.
_Avoid_: BOM dump, build order, parts list.

**Quote**:
A sales offer associated with one Customer for one Product, owned by one Salesperson, with an editable Status. Customer, Product, Salesperson, and Status are required at creation. Optional fields cover commercial detail (discount percent, deposit percent, Document Notes, valid_until, delivery_included, delivery_price), selected Optional Assemblies, delivery expectations (Preferred and Planned Delivery Dates), and internal Notes. The Product's `base_price` and currency are snapshot onto the Quote at creation and never change thereafter; the Product reference itself is also immutable post-creation. A Quote sources at most one Job: while it has none it stays editable, and creating its Job turns it into a Locked Quote (see Create Job from Quote and Locked Quote).

**Quote Status**:
A label on a Quote (`draft | sent | accepted | rejected | cancelled`). Freely editable with no transition rules *until* the Quote sources a Job: a Job can only be created from an `accepted` Quote, and once a Job exists the status (along with the rest of the Locked Quote fields) is frozen. Used for display, filtering, and sorting, and as the eligibility gate for Job creation.

**Customer**:
The company receiving a Quote or buying a Job. Customer-facing quote details come from the Customer's company name, VAT number, postal address, contact person, phone, and email when present.
_Avoid_: Client, buyer, account, contract person.

**Locked Quote**:
A Quote that has sourced its Job. Because a Quote sources at most one Job, this is binary: zero Jobs means an open, editable Quote; one Job means a Locked Quote. On a Locked Quote these fields are frozen forever: Product, Customer, Salesperson, selected Optional Assemblies, base price, discount percent, deposit percent, status, delivery inclusion, and delivery price. These remain editable: `valid_until`, Preferred/Planned Delivery Dates, internal Notes, and Document Notes (post-sale logistics and free text). The lock is irreversible — Jobs are not deleted, so a Locked Quote never reopens.

**Document Notes**:
Customer-facing free text on a Quote shown in the bottom-left notes area of the Quote Document. It may include payment terms, transport notes, lead time, or other customer-visible quote notes.
_Avoid_: Payment Terms, internal Notes.

**Deposit Percent**:
The numeric percentage of the Quote Total required as a customer deposit. On a Quote Document it is rendered as the Payment Terms line (e.g. "20% deposit required") and does not change the Quote Total.

**Preferred Delivery Date**:
The date the customer would like delivery. Optional, captured by the salesperson from the customer's ask. No enforced relationship to Planned Delivery Date — Planned may be earlier, later, or equal.

**Job Start Alert**:
A visibility signal for an accepted Quote that has no Job and has an earliest set delivery date on or before two calendar months from the current Johannesburg date, inclusive. The earliest set delivery date is the minimum of Preferred Delivery Date and Planned Delivery Date, ignoring blank dates; the alert exists to keep near-term accepted work visible until its Job is created.

**Planned Delivery Date**:
The date the salesperson commits to (or forecasts) for delivery. Optional. No enforced relationship to Preferred Delivery Date.

**Supplier**:
A procurement directory record with a unique name. Suppliers are admin-managed and are not yet linked to Jobs, Products, Quotes, or Pipeline planning.

**Part**:
A purchasable item from a Supplier, identified by a globally unique code. Parts are the shared atomic layer of the bill of materials and are reused across Products via Assemblies.
_Avoid_: Component, Item, SKU.

**Assembly**:
A named sub-assembly of a Product (e.g., chassis, axle assembly, tipper bed), composed of Parts in specified quantities. Assemblies are owned by a single Product; reuse happens at the Part layer, not the Assembly layer. An Assembly is either a **Standard Assembly** (always included in the Product's bill of materials) or an **Optional Assembly** (selectable at quote time, may override one or more Standard Assemblies).
_Avoid_: Component, Sub-assembly, Module.

**Standard Assembly**:
An Assembly that is included in every build of the Product by default. Its cost is rolled into the Product's `base_price`.

**Optional Assembly**:
An Assembly that is selected (or not) at quote time. Carries a `price` representing the *upgrade delta* added to the Product's `base_price` when selected. When selected, an Optional Assembly may override zero or more Standard Assemblies, removing their Parts from the effective bill of materials and replacing them with its own. Optionals with no overrides are purely additive.

**Quote Selected Assembly**:
An Optional Assembly selected on a Quote. The Quote stores a snapshot of the selected Optional Assembly's name and price, plus a nullable reference back to the Product Assembly when it still exists. The snapshot remains on the Quote until explicitly removed, even if the Product Assembly is later deleted or changed. Existing selected snapshots are preserved unchanged on quote edits; newly added catalog Optional Assemblies snapshot their current name and price when saved. Stale selected snapshots remain visible as unavailable notes on customer-facing Quote Documents but are excluded from priced line items and the Quote Total. Selected assemblies are editable until the Quote becomes a Locked Quote (i.e. until it sources a Job), after which they are frozen.

**Effective Bill of Materials**:
For a Quote with a selected set of currently available Optional Assemblies, the effective BOM is (Standard Assemblies not overridden by any selected Optional) ∪ (selected Optional Assemblies). Deleted or otherwise stale Quote Selected Assemblies remain commercial quote selections, but do not contribute override relationships because there is no current catalog relationship to trust. Selecting two Optional Assemblies that both override the same Standard Assembly is allowed for now.

**Quote Total**:
A client-side projection, not a persisted or server-returned aggregate. Quote totals are computed from the Quote pricing facts: snapshotted Product base price, selected Optional Assembly snapshot prices, discount percent, delivery inclusion, and delivery price. The discount percent applies to the Product plus selected Optional Assemblies; delivery is added afterward and is not discounted. The server stores and returns those inputs, but does not store a selected-option aggregate total or expose a quote `total` field. Deposit percent is stored on the Quote but does not affect this total.

**VAT Percent**:
The domain-owned value-added tax percentage used by customer-facing Quote Documents. Quote Documents display VAT separately from the Quote Total, which remains the VAT-exclusive subtotal projection.

**Quote Document**:
A generated customer-facing PDF packet of a Quote, owned by that Quote. A Quote may have multiple Quote Documents as the customer asks for changes; each is named as a revision, carries its revision in metadata, and the newest created Quote Document is treated as the latest one. It can be generated from a `draft`, `sent`, or `accepted` Quote, including a Locked Quote, but not from a `rejected` or `cancelled` Quote. It is a point-in-time record of the Quote offer, using the current live Customer details and the Quote Product's latest PDF brochure at generation time, where latest means the newest created Product Document classified as a brochure and stored as a PDF.

**Create Job from Quote**:
The single way a Job comes into existence. A user holding `job:create` (currently `admin`) triggers it from an `accepted` Quote that has no Job yet ("Generate CFO & Start Job"). The action: assigns the Product Serial Number, snapshots the Quote's Effective Bill of Materials into the Job's CFO, snapshots the Product's Documents onto the Job (see Job Document Snapshot), optionally seeds Work Slots onto Bays (see Job Bay Seeding), and turns the Quote into a Locked Quote. No Stage rows are created — Stages no longer exist. A Quote sources at most one Job. Creation is **blocked** if any selected Optional Assembly is stale (its catalog Assembly was deleted), because the CFO cannot resolve that assembly's Parts — the error names the offending assembly. There is no other Job-creation path (Direct Job Creation is retired) and no product-picking step; everything else is inherited from the Quote.

**Job Bay Seeding**:
The optional Bay-assignment step of the Create Job form. The form pre-fills editable rows from the Quote Product's enabled Product Bays, silently skipping Product Bays whose Bay is disabled; Products with no enabled Product Bays start with zero selected rows. It lists every enabled Bay grouped by Department in Pipeline order and lets the planner add or remove Bays (including several in one Department) and edit each row's working-days before submitting. Each retained row appends one Work Slot to that Bay's queue in the same transaction as Job creation — `durationDays` counting working days, with the same auto-inserted Idle Slot gap that booking on the Gantt uses when a Bay's queue ended before today. Seeding is optional: a Job may be created with zero Bays and scheduled entirely later on the Gantt.

**Audit Event**:
Field-level forensic log for boundary-visible changes. Current entity types include `customer`, `job`, `job_bay`, `product`, `quote`, `supplier`, and `user`. Admin Bay create/edit/disable is audited under `job_bay`, as are Operator Assignment assign/unassign events and Slot reorders (the before/after slot order, recorded against the Bay); Slot create/resize/remove are not audited. Product Assemblies, their Parts lists, and override links are part of the `product` aggregate and audited under the `product` entity — there is no separate `product_assembly` audit entity type.

**Demo User**:
A deterministic seeded auth user for local/staging sign-in and demo-account display. The canonical roster and shared password live in `pkg/domain/src/demo.ts`; database seeding code consumes that roster rather than duplicating demo-user facts.

**Thumbnail**:
An optional, square, display-only image attached to a User, Customer, Supplier, or Product for quick visual recognition. It is distinct from a Document.
_Avoid_: Avatar, Logo, Photo, Image.

**Document**:
A stored file owned by exactly one entity (a Product, Job, or Quote; Parts and other entities to follow). Documents are downloadable from the surfaces of their owner. A Product's Documents appear on the Product's own surfaces; the Job page surfaces the Job's frozen copies (the Job Document Snapshot), not the Product's live Documents. A Document has exactly one owner; there is no org-wide or owner-less ("global") Document. A Document is **immutable once created** — there is no in-place edit or replace. Its lifecycle is create and hard delete; to "replace" a Document a user deletes the existing one and creates it again. Filenames are **unique per owner** (case-insensitive); creating a duplicate filename for the same owner is rejected. Each Document also carries **metadata** — a small set of descriptive attributes whose required shape is defined **per owner type** (different owners demand different fields). A Product's Documents must declare a **type** (one of `sop`, `part_book`, or `brochure`), used to group them for display and to identify Product brochures for Quote Document generation; otherwise the type drives no permissions or snapshot selection. Metadata is set once at creation and, being part of the Document, is equally **immutable** — correcting a wrong value means delete and create again, never an in-place edit. Deleting a Document removes its row, but the underlying stored file is **never deleted from storage** and remains forensically recoverable through Audit history. A single stored file may be referenced by more than one Document (see Job Document Snapshot). Distinct from a Thumbnail (small, inline, display-only image).
_Avoid_: File, Attachment, Media, Asset.

**Job Document Snapshot**:
The Product's Documents frozen onto a Job at the moment the Job is created. Created alongside the CFO during Create Job from Quote, it copies the Job's Product's current Documents onto the Job as new Documents pointing at the same stored files. Each snapshotted Document remembers its **source** (the Product it came from) so the Job page can attribute it; the source's display name is read from the live Product (the same intentional drift the CFO accepts). It also carries its source Document's **metadata** (e.g. the Product document's type) copied verbatim and **frozen** — the Job page groups by this frozen copy, never re-reading it live. Only the source's *display name* is read live, because only the source entity can be renamed in place; a Document's metadata can never change in place, so there is nothing to drift. Like the CFO it is a **frozen build record**: read-only forever, and unaffected by later edits or deletions of the Product's Documents. Because stored files are never deleted, a later change to a Product Document never strands the Job's copy. (Snapshotting Part Documents — grouped per Part — is a planned future extension, out of scope for now and additive when it lands; likewise Job-specific document uploads are not part of this snapshot.)

**Dashboard**:
The single always-visible landing surface every signed-in user sees, regardless of App Role. It is composed of Dashboard Widgets filtered by the viewer's permissions — never a per-role bespoke page. There is exactly one Dashboard; per-user custom Dashboards are an anticipated but out-of-scope future extension.
_Avoid_: Home, Overview, Landing, Report.

**Dashboard Widget**:
A single self-contained item on the Dashboard — one chart, one list, or one stat — that declares the App Permission it requires to be shown. Widgets are entries in a registry; the Dashboard renders the subset the viewer is permitted to see. A viewer who lacks a Widget's required permission never sees it, so Role-dependence is a consequence of permission gating rather than per-role layout. Adding a Widget means adding a registry entry, not editing the Dashboard page.
_Avoid_: Card, Tile, Panel, Block.

**Dashboard Metric**:
A single computed read a Dashboard Widget displays — a count, a sum, or a grouped/time series — derived live from existing entity tables at request time. Dashboard Metrics are never persisted: there are no dashboard-specific rollup, summary, or reporting tables. They are read functions in `pkg/core`, permission-gated like any other read. A future Widget that needs an aggregate the live tables cannot answer cheaply may grow its own purpose-built read model in isolation, without affecting other Widgets.
_Avoid_: Stat, Rollup, Report, KPI.

## Relationships

- A **Job** has no Stage rows; it relates to a **Department** only through the **Slots** it holds on that Department's **Bays**. The five-Department Pipeline survives only as a display ordering.
- A **Job** references exactly one **Product** (inherited from its Quote).
- A **Job** references exactly one **Quote**; a **Quote** sources at most one **Job**.
- A **Quote** references one **Customer**, one **Product**, and one **Salesperson** at creation.
- A **Quote** may have zero or more **Quote Selected Assemblies**.
- A **Quote** may own **Quote Documents**.
- A **Department** has zero or more **Bays** (admin-managed); a Department is scheduled only if it has enabled Bays. Any of the five Departments may have Bays.
- A **Bay** belongs to exactly one **Department** and holds an ordered, non-overlapping queue of **Slots** from a fixed `scheduleOrigin`.
- A **Slot** is either a **Work Slot** or an **Idle Slot**. A Work Slot books one **Job** directly onto one **Bay** (its Department is the Bay's); the same Job may occupy more than one Work Slot on a Bay, in any Department, with no match validation. An Idle Slot has no Job and reserves Bay time in the same queue.
- A **Product** has zero or more **Product Bays**, each a (Bay, default working-days) pair for future **Job Bay Seeding** prefill.
- The org has one **Working Calendar** of explicit **Off-Days** applying to every **Bay**; a Bay may carry **Bay Calendar Exceptions** (Overtime / Bay Closure) that override the org Off-Days for that Bay alone. **Slot Projection** reads a Bay's effective calendar (org Off-Days overlaid with the Bay's Exceptions) to count Slot durations in working days.
- A **Supplier** currently stands alone as a procurement directory record.
- A **User** has exactly one **App Role** and may hold **Department Membership** in zero or more **Departments** (descriptive only — never an access scope).
- A **Bay** has at most one current **Bay Operator** via an **Operator Assignment**; a **Bay Operator** may hold several **Bays** at once. Past Operator Assignments are retained as first-class history.
- A **Document** has exactly one owning entity. A **Product** has zero or more **Documents**.
- Creating a **Job** snapshots its **Product**'s **Documents** onto the Job as a frozen **Job Document Snapshot** (see Create Job from Quote).

## Access

**admin**:
Full access to all application resources. The only role holding `job:schedule` (Bay scheduling: booking, resizing, and removing Slots, and Bay Calendar Exceptions) and the only role holding `job:update-calendar` (org-wide Off-Days), so all schedule mutation is admin-only for now.

Can read, create, and update Suppliers. Can create, edit, and disable Bays (the Admin Bay section).

**procurement-manager**:
Can read, create, and update Customers, Products, Parts, and Suppliers; can read Jobs (including their Bay schedule). Does not create Jobs or edit the schedule.

**job-viewer**:
Holds `job:read` only. Can view Jobs and the full Bay schedule across all Departments, but changes nothing — no Slot scheduling, no Bay Calendar Exceptions, no org Off-Day edits.
_Avoid_: job-department-manager (retired name), job-supervisor.

**sales**:
Can read, create, and update Quotes.

**bay-operator**:
Holds no App Permissions. A role with no permissions cannot sign in — there is no separate login flag; sign-in eligibility is derived from the role's permission set, so bay-operator accounts are records, not logins, until the role is ever granted a permission.
