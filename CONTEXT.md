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
One of the five fixed steps in the Pipeline, owned by a single Department. Represented by a `job_stage` row; all five rows are materialised at Job creation. A Stage has due/actual dates and one or more **Station Bookings**.
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
A Job's use of a Station within its owning Stage. Represented by a `job_stage_station` row carrying its own due/actual dates. Created at Job creation (defaults from the Product), editable by `job-supervisor`. The unit a Department Manager Starts/Stops.

**Station Catalog**:
The set of all Stations across all Departments. Read by anyone with `job:read` (to render Job views). Mutated by admins and `job-supervisor`s.

### Dates & defaulting

**Due Date**:
A planned start or end date at any of the three levels (Job, Stage, Station Booking). Editable only by `job-supervisor` and `admin`. Two fields per level: `due_start`, `due_end`.

**Actual Date**:
The recorded real start or end date at any level. Set by Department Managers via Start/Stop, by auto-cascade from lower levels, or by direct `job-supervisor` override. Two fields per level: `actual_start`, `actual_end`.

**Date Cascade (Down)**:
When a higher-level due date is created or shifted, lower-level due dates auto-recompute — *unless they were manually set*, in which case they're "sticky" and untouched. Direction:
- At Job creation, the supervisor enters Job `due_start` **or** `due_end` (toggle). The system walks forward (from `due_start`) or backward (from `due_end`) through Stage durations from the Product, then propagates to Station Bookings.
- After creation, editing a Job-level due date shifts auto fields by the same delta; sticky fields are pinned.
- A warning (not a block) is shown when the implied schedule is infeasible (e.g. due-end too soon for total Product duration).

**Date Cascade (Up)**:
When a Station Booking's actual date is recorded, the parent Stage's `actual_start` defaults to MIN of its station starts and `actual_end` defaults to MAX of its station ends — *unless manually set*. Same MIN/MAX rule cascades from Stage to Job. Manually set fields are sticky; clearing them re-enables auto-derivation.

**Sticky Override**:
A date field that has been set explicitly (not derived) is sticky: future cascades do not overwrite it. Tracked per field via a `*_set_manually` marker (or `set_by_user_id`). Clearing the value re-enables the auto rule. Applies uniformly to due dates (cascade-down) and actual dates (cascade-up).

**Product Duration**:
Per-Department duration defined on a Product, used to compute default due dates at Job creation. Five sub-forms per Product (one per Department), each carrying a duration and a default Station list. A Product not yet configured for a Department defaults to 0 days and no stations; the Create-Job dialog warns.

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
Computed from actual dates with no separate enum:
```
actual_start IS NULL                     → 'pending'
actual_start set, actual_end NULL        → 'in-progress'
actual_end set                           → 'complete'
```
Not stored.
_Avoid_: Stage Status (the previous per-department text enum is retired).

**`isPaused`**:
A boolean Job-level flag. When `true`: Department Managers cannot click Start/Stop on Station Bookings, and they cannot record actual dates. `job-supervisor`s can still edit any date (planners often pause *to* re-plan). Reversible.

**`isCancelled`**:
A boolean Job-level flag. When `true`: same blocks as `isPaused`. Reversible by `job-supervisor` (prototype model; may later become a one-way latch).

**Job Lifecycle Does Not Cascade**:
Pausing or cancelling a Job does not mutate Stage or Station Booking rows. Date history is preserved honestly; the pause/cancel gates write access at the API/UI layers.

**Auto-Start / Auto-Complete Cascade**:
- First Station Booking to record `actual_start` in a Stage auto-sets the Stage's `actual_start` (if not sticky).
- First Stage to record `actual_start` auto-sets the Job's `actual_start` (if not sticky).
- Last Station Booking to record `actual_end` in a Stage auto-sets the Stage's `actual_end` (if not sticky).
- Last Stage to record `actual_end` auto-sets the Job's `actual_end` (if not sticky). When that happens, the Derived Job Status becomes `complete`.

**Date Editability**:
Both due and actual dates are freely editable by `job-supervisor` and `admin`. There is no one-way completion latch (supersedes the previous "completion latch" rule). The audit trail (`AuditEvent` + `date.overridden` Job Event) is the safety net.

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
A sales offer associated with one Customer, optionally specifying a Product, price, discount, and validity window. **Customer is the only required field** at creation; Product and price may be filled in later. A Quote may spawn at most one Job. A Job *may* originate from a Quote but is not required to (see **Direct Job Creation**).
_Avoid_: Estimate, Proposal, Bid, Order.

**Quote Required Fields**:
At creation, only `customer_id` is required. Product, price, discount, valid-until, salesperson, and notes are all optional until the Quote is sent. **Quote Send** enforces that Product (and therefore Quoted Price) is set, since send-latches require something to latch.

**Quote Code**:
A Quote's human-facing reference, an auto-incrementing number rendered as `QUO-00001`.

**Quote Status**:
A Quote's fixed linear lifecycle: `draft → sent → (accepted | rejected)`.

**Quote Send**:
Sending a Quote latches it: Customer, Product, discount, valid-until, salesperson, notes, and the snapshotted price become immutable.

**Quote Conversion**:
Creating the single Job from a Quote in **`draft`** or **`accepted`** status, done by a `job-supervisor` or `admin`. Triggered from a per-Quote-row "Create Job" button — never automatic. Hidden when the Quote is `sent` (awaiting customer response) or `rejected`. Opens the Create-Job dialog with defaults from the Quote (Customer always; Product if set) and, when a Product is chosen, the Product's per-Department durations and default stations. All fields editable.
_Avoid_: "Auto-Convert on Accept" — there is no such trigger. _Avoid_: "Accepted-only conversion" — Draft Quotes can also spawn Jobs.

**Direct Job Creation**:
Creating a Job with no associated Quote — for stock builds, R&D prototypes, or warranty rebuilds. Uses the same Create-Job dialog, with Customer and Quote fields left empty.

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
- `stage.started`, `stage.ended` (emitted only when auto-cascaded from station events)
- `job.started`, `job.completed` (emitted only when auto-cascaded from stage events)
- `job.paused`, `job.resumed`, `job.cancelled`, `job.uncancelled`
- `date.overridden` (any supervisor-direct date edit; payload carries `entity_level`, `entity_id`, `field`, `old_value`, `new_value`)

**Dual Logging**:
Every state-changing endpoint writes both an Audit Event and a Job Event in the same transaction.

**Workflow History**:
The user-facing chronological view of a Job's Job Events.

### UI conventions

**Station Booking Summary on Job List**:
Per-Stage progress on the jobs list is rendered as a count chip (e.g. "Fabrication: 2/3 stations done"), not per-station chips. Detail comes on the Job detail page.

**Station Summary visibility**:
Station Booking dates (due + actual) are part of the Job aggregate — every `job:read` user sees them, regardless of Department membership. **Stage Detail and Station write affordances** (Start/Stop) remain Department-scoped. This extends ADR-0010.

**Gantt (deferred)**:
A planned visualization of Stage/Station Bookings across a Job and across the Job list. Used (later) to detect cross-Job conflicts on a shared Station ("Station A is overdouble-booked"). Not implemented yet; the data model supports the query via `(station_id, due_start, due_end, actual_start, actual_end)` per booking.

## Relationships

- A **Job** has exactly five **Stages**, materialised at creation, one per **Department** in fixed Pipeline order.
- A **Stage** is owned by exactly one **Department** and has zero or more **Station Bookings**.
- A **Station Booking** references exactly one **Station** in the catalog.
- A **Station** belongs to exactly one **Department**.
- A **User** has exactly one **App Role** and belongs to zero or more **Departments**.
- A Station-Booking write (Start/Stop) requires: (verb from Role) AND (Job is not paused/cancelled) AND (Scope rule on the booking's Department).
- A due-date or actual-date *override* requires `job-supervisor` or `admin`.
- Every Station-Booking state change writes one **Audit Event** + one or more **Job Events** (the direct event + any cascaded stage/job event) in the same transaction.
- A **Quote** references one **Customer**, one **Product**, one **Salesperson**.
- A **Quote** in `draft` or `accepted` status may be converted into at most one **Job**; **Job → Quote** is optional. `sent` and `rejected` Quotes cannot spawn Jobs.
- A **Product** carries five Department sub-forms, each with a default duration and default Station list.

## Example dialogue

> **Dev:** "I'm starting Paint on a Job whose Fabrication isn't done. Allowed?"
> **Domain expert:** "Yes — **Advisory Ordering**. The pipeline is a default for due-date layout, not a gate. The dates will record honestly what happened."

> **Dev:** "If I clear a Station Booking's `actual_end`, does the Stage's `actual_end` recompute?"
> **Domain expert:** "Yes — if the Stage's `actual_end` was auto-derived. If a supervisor manually set it, it's **sticky** and stays. Clear the sticky value to re-enable the cascade."

> **Dev:** "A Quote is accepted. Does a Job appear?"
> **Domain expert:** "No. A `job-supervisor` clicks **Create Job** on the Quote row. The dialog opens with defaults; all fields are editable. Same button also works on **draft** Quotes — useful when the customer has verbally agreed and we want a head start. It's hidden while the Quote is `sent` or `rejected`."

> **Dev:** "A Department Manager misclicked Stop. Can they re-Start?"
> **Domain expert:** "No — **Re-Start Refused**. They ask a supervisor to clear `actual_end`, then re-Start."

> **Dev:** "Where did Stage Status go?"
> **Domain expert:** "Retired. State is now derived from dates: `pending | in-progress | complete`. If we ever need richer station-level state, we'll add it at the Station level."

## Flagged ambiguities

- "Stage Status" was a rich per-department text enum. **Retired** — derived from dates now. Any richness needed later belongs at the Station level, not the Stage level.
- "Job Lifecycle Status" was a stored enum. **Retired** as a stored field — replaced by `isPaused`, `isCancelled` booleans + derived status.
- "Pipeline reachability / sequential gating" was the previous model. **Retired** — see **Advisory Ordering**.
- "Stage Completion is a One-Way Latch" was ADR-0005. **Retired** — see ADR-0017.
