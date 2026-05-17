# Jedidiah Platform

Domain language for the Jedidiah production-floor platform. The core unit being tracked is a **Job** — one physical product instance moving through a fixed five-stage pipeline.

## Language

### Job & pipeline

**Job**:
The platform's unit of production-floor tracking — one physical product instance being built end-to-end.
_Avoid_: Order, Work Order, Build, Ticket.

**Customer**:
A standalone business/organization record with contact details. A Customer reaches a Job only through a Quote — there is no direct Customer↔Job link.
_Avoid_: Job customer, Product customer (the link runs via Quote, not directly).

**Pipeline**:
The fixed, sequential sequence of five stages every Job moves through: Procurement → Fabrication → Assembly → Paint → Dispatch.
_Avoid_: Workflow, Process.

**Stage**:
One of the five fixed steps in the Pipeline, owned by a single Department. Represented by a `job_stage` row; all five rows are materialised at Job creation.
_Avoid_: Step, Phase, Task.

**Sequence Number**:
The 1..5 position of a Stage in the Pipeline. `(job_id, sequence)` is unique; sequence is how *order* is enforced, not the stage name.

**Due Date**:
An optional target completion date on a Job. Set at creation — via the create-from-Quote dialog or direct Job creation — and editable afterwards by anyone with `job:update`. A target only: it does not gate the Pipeline or Job Lifecycle.

### Status & lifecycle

**Stage Status**:
A Stage's per-department workflow position (e.g. "awaiting-supplier", "in-press"). Stored as `text` on `job_stage`; validated app-side via a Zod discriminated union keyed on `stage`. The per-stage status enums are deferred to each department's implementing slice.

**Stage Completion**:
A one-way latch on a Stage: `completed_at` may be set once and is not unset by normal workflow. Completing a Stage sets both `completed_at` and `status = 'complete'`; selecting the `complete` Stage Status uses the same completion semantics. Selecting `complete` after `completed_at` is set never rewrites `completed_at`: it only moves `status` back to `complete` when needed, and is a true no-op if the status is already `complete`. Later status edits may move away from `complete`, but they never clear `completed_at`.
_Avoid_: "Closed stage", "finished stage" (overloaded).

**Job Lifecycle Status**:
A Job-level state (`active | paused | complete | cancelled`) governing whether *any* Stage on the Job is open to mutation. Independent of Stage progress.
_Avoid_: Job Status, Job State (collides with Stage Status).

**Job-Level Lifecycle Does Not Cascade**:
Pausing or cancelling a Job does **not** mutate Stage rows. Stage rows preserve their honest history; lifecycle gating is enforced at the API/UI layers, not by rewriting Stage data.

**Auto-Complete-Job Transition**:
The single Stage→Job write: completing the Dispatch Stage atomically sets `job.lifecycle_status = 'complete'` in the same transaction.

### People & access

**Department**:
One of the five fixed teams that own a Stage: Procurement, Fabrication, Paint, Assembly, Dispatch. Modelled as a Zod enum. A User may belong to zero or more Departments via the `user_department` junction table.
_Avoid_: Team, Group.

**App Role**:
A flat role assigned to a User that grants verb capabilities on resources. Roles say "what verbs you can call"; they do not by themselves say "on which rows". See **Scope**.

**Scope**:
The rule that determines *which rows* a User's Job/Job-Stage verbs apply to. Scope is a property of the **User's Department-membership set**, not of their Role: a User with one or more Department memberships is **scoped** — verbs apply only to Stages owned by those Departments; a User with an empty membership set is **unscoped** — verbs apply to every Stage the Role permits. Empty membership means "all Departments", not "no access". Scope is enforced by the **Job Authorization Policy** (the `can*Stage` functions in `pkg/domain/src/auth/authorization.ts`) — it is not encoded in the permission strings.

**Department-Aware Role**:
A Role for which Department membership is consulted, so a User holding it can be either scoped or unscoped depending on their memberships. Currently: `job-stage-editor`, `job-supervisor`, `job-viewer` — the members of `DEPARTMENT_AWARE_ROLES`. For these roles `user_department` is read when the access summary is built.
_Avoid_: "Department-Scoped Role" (scope is a property of the User, not the Role).

**Department-Blind Role**:
A Role for which Department membership is never consulted; its verbs always apply cross-cutting. Currently: `admin`, the `product-*` roles, and `sales` — none of which have Department-scoped Job access. `user_department` is never read for these roles, so such a User is always unscoped.
_Avoid_: "Cross-Cutting Role" applied to `job-supervisor`/`job-viewer` — those are Department-Aware and cross-cutting only when the User has no Departments.

**`job-stage-editor`**:
Department-Aware Role. Reads and writes Stages owned by the User's Departments; with no Departments selected, reads and writes all Stages.

**`job-viewer`**:
Department-Aware, read-only Role for people who need pipeline visibility without editing (planners, account managers). Distinct from the `sales` Role, which has no Job access at all. Cross-cutting when the User has no Departments; scoped to the User's Departments when any are assigned.

**`job-supervisor`**:
Department-Aware, read+write Role for planners/supervisors. Includes Job lifecycle transitions (pause/resume/cancel). Cross-cutting when the User has no Departments; scoped to the User's Departments when any are assigned.

**`sales`**:
Department-Blind Role for the sales team. Grants `quote:*` (create, read, update Quotes) and nothing on Jobs or Stages. A Salesperson holding it cannot convert an accepted Quote into a Job — that is a `job-supervisor`/`admin` action.

### Logs

**Audit Event**:
Existing field-level forensic log. Records *what field changed from what to what, by whom, when*. Extended with `job`, `job_stage`, and `quote` entity types. Quote state changes are recorded with Audit Events only — there is no typed Quote event log (see ADR-0008).

**Job Event**:
New typed workflow-transition log (`job_event` table). Records *which business transition occurred*: `stage.started`, `stage.status_changed`, `stage.completed`, `job.paused`, `job.resumed`, `job.cancelled`, `job.completed`. Payload is a Zod-validated discriminated union on `event_type`.

**Dual Logging**:
Every state-changing endpoint writes both an Audit Event and a Job Event in the same transaction. The workflow-history UI queries Job Event; the forensic-audit UI queries Audit Event. Neither replaces the other.

**Workflow History**:
The user-facing chronological view of a Job's Job Events. Distinct from the forensic Audit log.

### UI conventions

**Completed-Stage Visibility**:
A UI/query-default convention — list views hide Stages whose `completed_at` is set; an `includeCompleted` toggle reveals them. **No persisted flag**; not an authorization concept. Detail views always show the full Pipeline.

### Customers

**Customer**:
A business or organization the company builds equipment for. A standalone directory record — Company Name is the only required field; Email, Address (free-text), Contact Person, Phone, and Notes are optional. A Customer can be quick-created inline while drafting a Quote with just a Company Name.
_Avoid_: Client, Account, Buyer. "Contact" is a field on a Customer (`contactPerson`), not a synonym for Customer.

### Quotes

**Quote**:
A sales offer to build one Product for one Customer at an agreed price — the bridge between a Customer and the production floor. An accepted Quote can spawn at most one Job.
_Avoid_: Estimate, Proposal, Bid, Order.

**Quote Code**:
A Quote's human-facing reference, an auto-incrementing number rendered as `QUO-00001`. The sales-side counterpart of a Job Code; the UUID remains the storage key.

**Quote Status**:
A Quote's position in a fixed linear lifecycle: `draft → sent → (accepted | rejected)`. A separate concept from Job Lifecycle Status and Stage Status.
_Avoid_: Quote State.

**Quote Send**:
Sending a Quote (`draft → sent`) latches it: Customer, Product, discount, valid-until, salesperson, notes, and the snapshotted price all become immutable. After send only Status may change, and only to `accepted` or `rejected`. Revisions are made by issuing a new `draft` Quote, not by editing a sent one.

**Quoted Price**:
The Product's `base_price` and currency, copied onto the Quote on send. The Quote total is `Quoted Price − discount` and never moves when the Product is later re-priced.
_Avoid_: live price, current price.

**Quote Discount**:
A fixed cash amount subtracted from the Quoted Price, in the Quote's currency. Constrained to `0 ≤ discount ≤ Quoted Price`, so a Quote total is never negative.
_Avoid_: percentage discount, markdown.

**Valid Until**:
An informational expiry date on a Quote — used for display and sorting only. It never changes Quote Status and never blocks acceptance; there is deliberately no `expired` status.

**Salesperson**:
The User who owns a Quote. Any User whose App Role grants `quote:*` — currently the `sales` or `admin` Role.
_Avoid_: Quote owner, Account manager.

**Quote Conversion**:
Creating the single Job from an `accepted` Quote, done by a `job-supervisor` or `admin` (not the Salesperson). The new Job copies the Quote's Product; the conversion dialog also sets the Job's optional Due Date.

## Relationships

- A **Job** has exactly five **Stages**, materialised at creation, one per **Department** in fixed Pipeline order.
- A **Stage** is owned by exactly one **Department**.
- A **User** has exactly one **App Role** and belongs to zero or more **Departments**.
- A **Stage** mutation requires: (verb permission from the User's Role) AND (the Job's Lifecycle Status is `active`) AND (the Stage's Sequence is reachable per the Stage Transition Policy) AND (Scope rule — if the User has Department memberships, the Stage's Department is among them; a User with no memberships is unscoped).
- Pipeline reachability is governed by `completed_at`, not by the Stage Status label. `status = 'complete'` is synchronized with completion when first selected, but status edits after completion do not reopen or re-block the Pipeline.
- Every Stage state change writes one **Audit Event** + one **Job Event** in the same transaction.
- A **Quote** references exactly one **Customer**, one **Product**, and one **Salesperson** — the Customer↔Quote link lives on the Quote.
- A **Customer** has zero or more **Quotes**. A Customer remains standalone with respect to **Jobs**, **Stages**, and **Products** — it reaches them only along the **Customer → Quote → Job** chain.
- An `accepted` **Quote** may be converted into at most one **Job**; the **Job → Quote** link is optional — a Job can also be created directly with no Quote. A Job created from a Quote copies that Quote's **Product**.
- A **Quote** state change writes one **Audit Event** (`entity_type = 'quote'`) and no **Job Event**.

## Example dialogue

> **Dev:** "If I pause a **Job** mid-Fabrication, what happens to the Fabrication **Stage**?"
> **Domain expert:** "Nothing. **Job-Level Lifecycle Does Not Cascade**. The Stage keeps its `status` and `started_at`; we just refuse writes to it until the Job is active again."

> **Dev:** "A planner needs to see every Job's progress but can't edit anything. **Department** member of all five?"
> **Domain expert:** "No — that would be a hack. They get the **`job-viewer`** Role with *no* Department memberships. An **unscoped** User sees the whole Pipeline; assigning Departments would narrow them. The Role gives read-only verbs either way."

> **Dev:** "A **Quote** was accepted, then the customer asks for a bigger discount. Can the **Salesperson** edit it?"
> **Domain expert:** "No — the **Quote** was frozen the moment it was sent. They issue a new `draft` **Quote**. The accepted one keeps its snapshotted **Quoted Price** honest — and it's a `job-supervisor`, not the Salesperson, who turns it into a **Job**."

> **Dev:** "Procurement marked their **Stage** complete but now they need to add a late PO. Allowed?"
> **Domain expert:** "Yes. **Stage Completion** is a one-way latch on `completed_at`, but **Stage Status** keeps moving after. They can still update status, but we never clear `completed_at`."

## Flagged ambiguities

- "Status" was used ambiguously between **Stage Status** (per-Stage workflow position) and **Job Lifecycle Status** (Job-level mutability gate). Resolved: distinct concepts on different rows.
- "Job-viewer / job-supervisor" felt like a "split brain" alongside the Role enum — the discomfort came from missing the **Scope** concept. They are not hacks: all three of `job-stage-editor`, `job-supervisor`, `job-viewer` are **Department-Aware**. Whether a User is scoped depends on their Department memberships, not on which of the three Roles they hold.
- "Sales" named both the `job-viewer` Role (informally "the sales role") and the actual sales team. Resolved: `sales` is now a distinct Department-Blind App Role carrying the `quote:*` permissions; `job-viewer` remains a separate read-only Job-visibility Role with no Quote access.
