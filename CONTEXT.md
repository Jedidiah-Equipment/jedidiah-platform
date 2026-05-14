# Jedidiah Platform

Domain language for the Jedidiah production-floor platform. The core unit being tracked is a **Job** — one physical product instance moving through a fixed five-stage pipeline.

## Language

### Job & pipeline

**Job**:
The platform's unit of production-floor tracking — one physical product instance being built end-to-end.
_Avoid_: Order, Work Order, Build, Ticket.

**Pipeline**:
The fixed, sequential sequence of five stages every Job moves through: Procurement → Fabrication → Paint → Assembly → Dispatch.
_Avoid_: Workflow, Process.

**Stage**:
One of the five fixed steps in the Pipeline, owned by a single Department. Represented by a `job_stage` row; all five rows are materialised at Job creation.
_Avoid_: Step, Phase, Task.

**Sequence Number**:
The 1..5 position of a Stage in the Pipeline. `(job_id, sequence)` is unique; sequence is how *order* is enforced, not the stage name.

### Status & lifecycle

**Stage Status**:
A Stage's per-department workflow position (e.g. "awaiting-supplier", "in-press"). Stored as `text` on `job_stage`; validated app-side via a Zod discriminated union keyed on `stage`. The per-stage status enums are deferred to each department's implementing slice.

**Stage Completion**:
A one-way latch on a Stage: `completed_at` may be set once and is not unset by normal workflow. Setting `completed_at` does **not** change `status` — status may continue to move freely after completion (e.g. for late edits). Distinct from Stage Status — completion is orthogonal.
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
The rule that determines *which rows* a Role's verbs apply to. A Role is either **department-scoped** (its verbs only apply to rows owned by Departments the User belongs to) or **cross-cutting** (its verbs apply to all rows of the resource). Scope is a property of the Role enforced by the **Job Authorization Policy** module — it is not encoded in the permission strings.

**Department-Scoped Role**:
A Role whose effective access is intersected with the User's Department memberships. Currently: `job-stage-editor`.

**Cross-Cutting Role**:
A Role whose access is not narrowed by Department membership. Currently: `job-viewer`, `job-supervisor`, `admin`.

**`job-stage-editor`**:
Department-scoped Role. Can read and write Stages owned by the User's Departments.

**`job-viewer`**:
Cross-cutting read-only Role for people who need full pipeline visibility without editing (e.g. sales).

**`job-supervisor`**:
Cross-cutting read+write Role for planners/supervisors. Includes Job lifecycle transitions (pause/resume/cancel).

### Logs

**Audit Event**:
Existing field-level forensic log. Records *what field changed from what to what, by whom, when*. Extended with `job` and `job_stage` entity types.

**Job Event**:
New typed workflow-transition log (`job_event` table). Records *which business transition occurred*: `stage.started`, `stage.status_changed`, `stage.completed`, `job.paused`, `job.resumed`, `job.cancelled`, `job.completed`. Payload is a Zod-validated discriminated union on `event_type`.

**Dual Logging**:
Every state-changing endpoint writes both an Audit Event and a Job Event in the same transaction. The workflow-history UI queries Job Event; the forensic-audit UI queries Audit Event. Neither replaces the other.

**Workflow History**:
The user-facing chronological view of a Job's Job Events. Distinct from the forensic Audit log.

### UI conventions

**Completed-Stage Visibility**:
A UI/query-default convention — list views hide Stages whose `completed_at` is set; an `includeCompleted` toggle reveals them. **No persisted flag**; not an authorization concept. Detail views always show the full Pipeline.

## Relationships

- A **Job** has exactly five **Stages**, materialised at creation, one per **Department** in fixed Pipeline order.
- A **Stage** is owned by exactly one **Department**.
- A **User** has exactly one **App Role** and belongs to zero or more **Departments**.
- A **Stage** mutation requires: (verb permission from the User's Role) AND (the Job's Lifecycle Status is `active`) AND (the Stage's Sequence is reachable per the Stage Transition Policy) AND (Scope rule — for department-scoped Roles, the Stage's Department is in the User's Departments).
- Every Stage state change writes one **Audit Event** + one **Job Event** in the same transaction.

## Example dialogue

> **Dev:** "If I pause a **Job** mid-Fabrication, what happens to the Fabrication **Stage**?"
> **Domain expert:** "Nothing. **Job-Level Lifecycle Does Not Cascade**. The Stage keeps its `status` and `started_at`; we just refuse writes to it until the Job is active again."

> **Dev:** "A salesperson needs to see every Job's progress but can't edit anything. **Department** member of all five?"
> **Domain expert:** "No — that would be a hack. They get the **`job-viewer`** Role. It's **Cross-Cutting** — no Department membership needed, no editing."

> **Dev:** "Procurement marked their **Stage** complete but now they need to add a late PO. Allowed?"
> **Domain expert:** "Yes. **Stage Completion** is a one-way latch on `completed_at`, but **Stage Status** keeps moving after. They can still update."

## Flagged ambiguities

- "Status" was used ambiguously between **Stage Status** (per-Stage workflow position) and **Job Lifecycle Status** (Job-level mutability gate). Resolved: distinct concepts on different rows.
- "Job-viewer / job-supervisor" felt like a "split brain" alongside the Role enum — the discomfort came from missing the **Scope** concept. They are not hacks; they are the **Cross-Cutting** counterparts to the **Department-Scoped** `job-stage-editor`.
