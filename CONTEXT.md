# Jedidiah Platform

Domain language for the Jedidiah production-floor platform. The core unit being tracked is a **Job** — one physical product instance moving through a five-stage manufacturing pipeline. Each Stage is owned by a Department and contains one or more **Stations** that do the physical work.

## Language

### Job & pipeline

**Job**:
The platform's unit of production-floor tracking — one physical product instance being built end-to-end. A Job may originate from a Quote (the typical path) or be created directly (stock builds, R&D, warranty rebuilds).
_Avoid_: Order, Work Order, Build, Ticket.

**Customer**:
A standalone business/organization record with contact details. A Customer reaches a Job only through a Quote. A Job created directly (no Quote) has no Customer.
_Avoid_: Job customer, Product customer.

**Pipeline**:
The five-stage manufacturing sequence: Procurement → Supply → Fabrication → Paint → Assembly. The sequence is the **default ordering for due-date defaulting and visual layout only**; actual work is not gated by it (see **Advisory Ordering**).
_Avoid_: Workflow, Process.

**Stage**:
One of the five fixed steps in the Pipeline, owned by a single Department. Represented by a `job_stage` row; all five rows are materialised at Job creation. A Stage has one or more **Station Bookings**; its Planned and Actual Windows are a derived rollup of those Bookings (never stored).
_Avoid_: Step, Phase, Task.

**Department-facing Stage Label**:
Stages are user-facing labelled by their owning Departments: Procurement, Supply, Fabrication, Paint, Assembly. Internally these remain **Stages** and `job_stage` rows.
_Avoid_: Stage 1..5 in user-facing copy.

**Sequence Number**:
The 1..5 default position of a Stage in the Pipeline. Used for visual ordering and due-date defaulting only — not for gating.

**Procurement**:
The vendor-facing purchasing Stage. Owned by the Procurement Department.

**Supply**:
The Stage covering in-house receipt, QC, and staging of materials purchased during Procurement. Owned by the Supply Department. Distinct from Procurement (which is vendor-facing). Commonly overlaps with Procurement and Fabrication in time.

**Fabrication**:
The Stage covering metalwork, machining, and component manufacture. Owned by the Fabrication Department.

**Paint**:
The Stage covering surface preparation and painting — typically of fabricated parts before final assembly. Owned by the Paint Department.

**Assembly**:
The Stage covering final assembly, fit-out, and QC of the finished product. Owned by the Assembly Department. The last manufacturing stage; logistics/dispatch is handled outside the Job model.

**Advisory Ordering**:
The Pipeline order is a default for due-date computation and visual ordering, not a gate. Any Stage may be started or ended in any order; the data records what actually happened. Gating may be re-introduced later via configuration if floor discipline requires it.
_Avoid_: "sequential pipeline", "next stage", "Pipeline reachability" — these terms applied to the older gated model and are retired.

### Station model

**Station**:
A named physical resource that performs floor work for exactly one Department — e.g. "Weld Bay 1", "Paint Booth A". A catalog record (`station` table) independent of any Job. Managed by admins and `job-supervisor`s. Soft-deactivated (`is_active = false`) when retired; never hard-deleted.
_Avoid_: Workstation, Cell, Bench (use Station consistently).

**Station Booking**:
A Job's use of a Station within its owning Stage. Represented by a `job_stage_station` row carrying its own Planned Window and Actual Window — the only level where schedule dates are stored. Created at Job creation (defaults from the Product), editable by `job-supervisor`. The unit a Department Manager Starts/Stops.

**Station Catalog**:
The set of all Stations across all Departments. Read by anyone with `job:read` (to render Job views). Mutated by admins and `job-supervisor`s.

**Station Contention**:
Two or more Jobs holding a Station Booking on the same Station over overlapping date ranges. **Explicitly allowed** — the platform does not prevent it — but it is surfaced visually (see **Schedule Gantt**) so a planner can see and resolve it deliberately. Overlap may exist on planned (due) ranges, actual ranges, or both.
_Avoid_: "double-booking" as an error term — contention is permitted, not a fault.

### Dates & scheduling

**Planned Window**:
A `start`/`end` date range describing when work is *planned*. Stored only on a **Station Booking** (`planned_start`, `planned_end`). At **Stage** and **Job** level the Planned Window is a derived rollup, never stored.
_Avoid_: "due dates" for this range — reserve "due" for the **Job Due Date**.

**Actual Window**:
A `start`/`end` date range recording when work *actually* happened. Stored only on a **Station Booking** (`actual_start`, `actual_end`), set by Department Managers via Start/Stop or by `job-supervisor` edit. At **Stage** and **Job** level the Actual Window is a derived rollup, never stored.

**Schedule Rollup**:
The pure derivation of a Stage's or Job's Planned and Actual Windows from Station Bookings: `start` = MIN of the bookings' starts; `end` = MAX of the bookings' ends, contributed only once *every* booking has an `end`. A **Stage** rolls up its own Bookings; a **Job** rolls up **all** of its Bookings directly (flattened across Stages), so a Stage with zero Bookings contributes nothing and never blocks Job completion. Computed at read/projection time, and at write time for milestone-event detection. The result is never persisted — there is no cascade and no sticky state.

**Job Due Date**:
A single, optional date on the Job (`due_date`) — a deadline marker, set manually. It has **no** computed relationship to any Station Booking, Stage, Window, or rollup; it is purely an indicator, rendered as a red vertical line on the **Schedule Gantt**. The only thing the platform calls a "due date".
_Avoid_: conflating it with the Job's derived Planned Window.

**Station-Booking Date Validation**:
The sole date rule is per-Station-Booking: `end` must be on or after `start`, applied independently to the Planned Window and the Actual Window. There is no cross-Station, cross-Stage, or cross-level validation.

**Product Duration**:
Per-Department duration defined on a Product, used **only at Job creation** to seed each Station Booking's Planned Window. Five sub-forms per Product (one per Department), each carrying a duration and a default Station list. A Product not yet configured for a Department defaults to 0 days and no stations; the Create-Job dialog warns.

**Creation Anchor**:
A transient date plus a start/end choice entered in the Create-Job dialog. It cascades **once** through Product Durations to seed every Station Booking's Planned Window, then is discarded — it is not a stored Job field. The optional **Job Due Date** is a separate field in the dialog, pre-filled to the cascaded end date. After creation no dates are ever cascaded again.

### Status & lifecycle

**Derived Job Status**:
The Job's user-facing state, computed from flags and dates with this precedence:
```
isCancelled                              → 'cancelled'
isPaused                                 → 'paused'
job.actual_end IS NOT NULL               → 'complete'
job.actual_start IS NOT NULL             → 'active'
else                                     → 'not-started'
```
Not stored — derived on read.
_Avoid_: Job Lifecycle Status (the previous *stored* enum is retired).

**Derived Stage / Station Status**:
Computed from the Actual Window with no separate enum — for a Station Booking from its stored `actual_start`/`actual_end`, for a Stage from its rolled-up Actual Window:
```
start absent                             → 'pending'
start present, end absent                → 'in-progress'
end present                              → 'complete'
```
Not stored.
_Avoid_: Stage Status (the previous per-department text enum is retired).

**`isPaused`**:
A boolean Job-level flag. When `true`: Department Managers cannot click Start/Stop on Station Bookings, and they cannot record actual dates. `job-supervisor`s can still edit any date (planners often pause *to* re-plan). Reversible.

**`isCancelled`**:
A boolean Job-level flag. When `true`: same blocks as `isPaused`. Reversible by `job-supervisor` (prototype model; may later become a one-way latch).

**Job Lifecycle Does Not Cascade**:
Pausing or cancelling a Job does not mutate Stage or Station Booking rows. Date history is preserved honestly; the pause/cancel gates write access at the API/UI layers.

**Stage / Job Milestone Events**:
A Station Booking Start/Stop recomputes the **Schedule Rollup** for the parent Stage and Job before and after the write. When a Stage's or Job's derived Actual Window `start` (or `end`) flips from absent to present, the matching `stage.started` / `stage.ended` / `job.started` / `job.completed` Job Event is emitted. Nothing is persisted — only the event row is written.

**Date Editability**:
The editable date surface is exactly: a Station Booking's Planned and Actual Window dates, and the **Job Due Date** — all editable by `job-supervisor` and `admin`. Stage and Job Windows are derived (**Schedule Rollup**) and cannot be edited; there is nothing stored to edit. There is no one-way completion latch; the audit trail (`AuditEvent` + `date.overridden` Job Event) is the safety net.

**Re-Start Refused**:
A Department Manager cannot re-Start a Station Booking that has both `actual_start` and `actual_end` set. The fix path is to ask a `job-supervisor` to clear `actual_end`.

### People & access

**Department**:
One of the five fixed teams that own a Stage: Procurement, Supply, Fabrication, Paint, Assembly. Modelled as a Zod enum. A User may belong to zero or more Departments via the `user_department` junction table.
_Avoid_: Team, Group.

**App Role**:
A flat role assigned to a User that grants verb capabilities on resources.

**Scope**:
The rule that determines *which rows* a User's Job/Stage/Station verbs apply to. Scope is a property of the **User's Department-membership set**, not of their Role: a User with one or more memberships is **scoped** to those Departments; a User with an empty membership set is **unscoped** (verbs apply to all rows the Role permits). Scope governs **Stage Detail** read and Station-write affordances; Stage Summary and Station Summary are part of the Job aggregate and are never scoped.

**`admin`**:
Department-Blind. All verbs everywhere, including Station Catalog management.

**`job-supervisor`**:
Department-Aware. Cross-cutting when the User has no Departments; scoped when any are assigned. Capabilities:
- Create Jobs (from Quote or directly)
- Configure all due dates at all three levels
- Override any actual date at any level
- Add/remove Station Bookings on a Job, before or after creation
- Toggle `isPaused`, `isCancelled`
- Manage the Station Catalog

**`job-department-manager`** (renamed from `job-stage-editor`):
Department-Aware. Reads Stage Detail and Station Bookings for owned Departments (or all if unscoped). The only mutation is **Start/Stop on Station Bookings** in their Departments. Cannot edit due dates, override actual dates, or change the Station list.
_Future_: a `job-department-member` role is anticipated — same as `job-department-manager` but further scoped to specific Stations (user↔Station link). Out of scope for now.

**`sales`**:
Department-Blind. `quote:*` only. Cannot create Jobs.

**`product-editor`**:
Department-Blind. Manages Products and their per-Department duration sub-forms.

### Quotes

**Quote**:
A sales offer associated with one Customer, optionally specifying a Product, price, discount, and validity window. **Customer is the only required field** at creation; Product and price may be filled in later. A Quote may be the source of any number of Jobs (zero or more). A Job *may* originate from a Quote but is not required to (see **Direct Job Creation**).
_Avoid_: Estimate, Proposal, Bid, Order.

**Quote Required Fields**:
At creation, only `customer_id` is required. Product, price, discount, valid-until, salesperson, and notes are all optional until the Quote is sent. **Quote Send** enforces that Product (and therefore Quoted Price) is set, since send-latches require something to latch.

**Quote Code**:
A Quote's human-facing reference, an auto-incrementing number rendered as `QUO-00001`.

**Quote Status**:
A Quote's fixed linear lifecycle: `draft → sent → (accepted | rejected)`.

**Quote Send**:
Sending a Quote latches it: Customer, Product, discount, valid-until, salesperson, notes, and the snapshotted price become immutable.

**Create Job from Quote**:
Creating a Job whose `quote_id` references a Quote, done by a `job-supervisor` or `admin`. Triggered from a per-Quote-row "Create Job" button — never automatic. Available while the Quote is `draft`, `sent`, or `accepted`; hidden only for `rejected`. A Quote may be the source of any number of Jobs — the button never disappears after the first. Opens the Create-Job dialog showing the Quote Code and Customer Name read-only, with the Product defaulted to the Quote's Product if set (still editable) and, when a Product is chosen, the Product's per-Department durations and default Stations. All editable fields stay editable.
_Avoid_: "Quote Conversion", "convert" — a Quote is never consumed or transformed; it is the optional source of Jobs. _Avoid_: "Auto-Convert on Accept" — there is no such trigger.

**Direct Job Creation**:
Creating a Job with no associated Quote — for stock builds, R&D prototypes, or warranty rebuilds. Uses the same Create-Job dialog; the dialog has no Customer or Quote picker in any mode, so direct mode shows only Product, dates, and Stations.

**Salesperson**:
The User who owns a Quote.

**Quoted Price / Quote Discount / Valid Until**:
Unchanged from prior model — see Quote section in ADR-0006.

### Logs

**Audit Event**:
Field-level forensic log: *what field changed from what to what, by whom, when*. Extended to cover `job`, `job_stage`, `job_stage_station`, and `station` entity types.

**Job Event**:
Typed workflow-transition log (`job_event` table). New taxonomy:
- `station.started`, `station.ended`
- `stage.started`, `stage.ended` (emitted when a Station write flips the Stage's derived Actual Window — see **Stage / Job Milestone Events**)
- `job.started`, `job.completed` (emitted when a Station write flips the Job's derived Actual Window)
- `job.paused`, `job.resumed`, `job.cancelled`, `job.uncancelled`
- `date.overridden` (a supervisor-direct edit to a Station Booking date or the Job Due Date; payload carries `entity_level`, `entity_id`, `field`, `old_value`, `new_value`)

**Dual Logging**:
Every state-changing endpoint writes both an Audit Event and a Job Event in the same transaction.

**Workflow History**:
The user-facing chronological view of a Job's Job Events.

### UI conventions

**Station Booking Summary on Job List**:
Per-Stage progress on the jobs list is rendered as a count chip (e.g. "Fabrication: 2/3 stations done"), not per-station chips. Detail comes on the Job detail page.

**Station Summary visibility**:
Station Booking dates (due + actual) are part of the Job aggregate — every `job:read` user sees them, regardless of Department membership. **Stage Detail and Station write affordances** (Start/Stop) remain Department-scoped. This extends ADR-0010.

**Schedule Gantt**:
The timeline visualization of a Job's schedule. **Station Booking** rows carry full, draggable Planned and Actual Window bars — the only editable rows. **Stage** and **Job** rows render their derived (rolled-up) Windows as thin, non-interactive lines. The **Job Due Date** is drawn as a red vertical line across the grid. Per Station row the Planned Window is the planned track and the Actual Window is overlaid on it, so slippage is visible at a glance. Other Jobs may be toggled in to overlay per-Station occupancy bars, revealing **Station Contention** on shared Stations. Used on the Job Detail page, and — in a Planned-Window-only form — the Create-Job dialog.

## Relationships

- A **Job** has exactly five **Stages**, materialised at creation, one per **Department** in fixed Pipeline order.
- A **Stage** is owned by exactly one **Department** and has zero or more **Station Bookings**.
- A **Station Booking** references exactly one **Station** in the catalog.
- A **Station** belongs to exactly one **Department**.
- A **User** has exactly one **App Role** and belongs to zero or more **Departments**.
- A Station-Booking write (Start/Stop) requires: (verb from Role) AND (Job is not paused/cancelled) AND (Scope rule on the booking's Department).
- A **Stage**'s and **Job**'s Planned and Actual Windows are derived by **Schedule Rollup** from Station Bookings — never stored, never directly edited.
- Editing any Station Booking date, or the **Job Due Date**, requires `job-supervisor` or `admin`.
- Every Station-Booking state change writes one **Audit Event** + one or more **Job Events** (the direct event + any derived Stage/Job milestone event) in the same transaction.
- A **Quote** references one **Customer**, one **Product**, one **Salesperson**.
- A **Quote** in `draft`, `sent`, or `accepted` status may be the source of any number of **Jobs** (zero or more); **Job → Quote** is optional. `rejected` Quotes cannot source Jobs.
- A **Product** carries five Department sub-forms, each with a default duration and default Station list.

## Example dialogue

> **Dev:** "I'm starting Paint on a Job whose Fabrication isn't done. Allowed?"
> **Domain expert:** "Yes — **Advisory Ordering**. The pipeline is a default for due-date layout, not a gate. The dates will record honestly what happened."

> **Dev:** "If I clear a Station Booking's `actual_end`, does the Stage's Actual Window recompute?"
> **Domain expert:** "Yes — always. A Stage's Window is a fresh **Schedule Rollup** of its Station Bookings every time it's read. There are no stored Stage dates and no sticky overrides; clearing a Booking date just changes what the next rollup sees."

> **Dev:** "Can I edit a Stage's planned end date directly?"
> **Domain expert:** "No — Stage and Job Windows are derived, there's no column to write. Edit the Station Bookings underneath; the Stage and Job Windows follow. The only stored 'due' value is the **Job Due Date** indicator, which is unrelated to any of it."

> **Dev:** "A Quote is accepted. Does a Job appear?"
> **Domain expert:** "No. A `job-supervisor` clicks **Create Job** on the Quote row. The dialog opens with defaults; all fields are editable. The button works on `draft`, `sent`, and `accepted` Quotes, and a Quote can source as many Jobs as you click it — it's hidden only when the Quote is `rejected`."

> **Dev:** "A Department Manager misclicked Stop. Can they re-Start?"
> **Domain expert:** "No — **Re-Start Refused**. They ask a supervisor to clear `actual_end`, then re-Start."

> **Dev:** "Where did Stage Status go?"
> **Domain expert:** "Retired. State is now derived from dates: `pending | in-progress | complete`. If we ever need richer station-level state, we'll add it at the Station level."

## Flagged ambiguities

- "Stage Status" was a rich per-department text enum. **Retired** — derived from dates now. Any richness needed later belongs at the Station level, not the Stage level.
- "Job Lifecycle Status" was a stored enum. **Retired** as a stored field — replaced by `isPaused`, `isCancelled` booleans + derived status.
- "Pipeline reachability / sequential gating" was the previous model. **Retired** — see **Advisory Ordering**.
- "Stage Completion is a One-Way Latch" was an earlier model. **Retired** — completion is a derived state that comes and goes with the Actual Window; the audit trail is the safety net. See ADR-0020.
- "Quote Conversion" implied a 1:1 Quote→Job transformation. **Retired** — a Quote is the optional source of *any number* of Jobs (see **Create Job from Quote** and ADR-0018).
- "Date Cascade (Down)", "Date Cascade (Up)", and "Sticky Override" were an earlier model. **Retired** — Stage and Job dates are now a derived **Schedule Rollup**; only Station Bookings store dates; the only cascade left is the one-time **Creation Anchor** seeding. See ADR-0020.
- "Job-level due dates" (`due_start`/`due_end`) and "Stage-level dates" as stored, editable fields. **Retired** — the Job stores a single optional **Job Due Date** indicator; Stage stores no dates at all. See ADR-0020.
