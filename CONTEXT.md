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
The rule that determines *which rows* a User's Job/Job-Stage verbs apply to. Scope is a property of the **User's Department-membership set**, not of their Role: a User with one or more Department memberships is **scoped** — verbs apply only to Stages owned by those Departments; a User with an empty membership set is **unscoped** — verbs apply to every Stage the Role permits. Empty membership means "all Departments", not "no access". Scope is enforced by the **Job Authorization Policy** (the `can*Stage` functions in `pkg/domain/src/auth/authorization.ts`) — it is not encoded in the permission strings.

**Department-Aware Role**:
A Role for which Department membership is consulted, so a User holding it can be either scoped or unscoped depending on their memberships. Currently: `job-stage-editor`, `job-supervisor`, `job-viewer` — the members of `DEPARTMENT_AWARE_ROLES`. For these roles `user_department` is read when the access summary is built.
_Avoid_: "Department-Scoped Role" (scope is a property of the User, not the Role).

**Department-Blind Role**:
A Role for which Department membership is never consulted; its verbs always apply cross-cutting. Currently: `admin` (and the `product-*` roles, which have no Job access at all). `user_department` is never read for these roles, so such a User is always unscoped.
_Avoid_: "Cross-Cutting Role" applied to `job-supervisor`/`job-viewer` — those are Department-Aware and cross-cutting only when the User has no Departments.

**`job-stage-editor`**:
Department-Aware Role. Reads and writes Stages owned by the User's Departments; with no Departments selected, reads and writes all Stages.

**`job-viewer`**:
Department-Aware, read-only Role for people who need pipeline visibility without editing (e.g. sales). Cross-cutting when the User has no Departments; scoped to the User's Departments when any are assigned.

**`job-supervisor`**:
Department-Aware, read+write Role for planners/supervisors. Includes Job lifecycle transitions (pause/resume/cancel). Cross-cutting when the User has no Departments; scoped to the User's Departments when any are assigned.

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
- A **Stage** mutation requires: (verb permission from the User's Role) AND (the Job's Lifecycle Status is `active`) AND (the Stage's Sequence is reachable per the Stage Transition Policy) AND (Scope rule — if the User has Department memberships, the Stage's Department is among them; a User with no memberships is unscoped).
- Every Stage state change writes one **Audit Event** + one **Job Event** in the same transaction.

## Example dialogue

> **Dev:** "If I pause a **Job** mid-Fabrication, what happens to the Fabrication **Stage**?"
> **Domain expert:** "Nothing. **Job-Level Lifecycle Does Not Cascade**. The Stage keeps its `status` and `started_at`; we just refuse writes to it until the Job is active again."

> **Dev:** "A salesperson needs to see every Job's progress but can't edit anything. **Department** member of all five?"
> **Domain expert:** "No — that would be a hack. They get the **`job-viewer`** Role with *no* Department memberships. An **unscoped** User sees the whole Pipeline; assigning Departments would narrow them. The Role gives read-only verbs either way."

> **Dev:** "Procurement marked their **Stage** complete but now they need to add a late PO. Allowed?"
> **Domain expert:** "Yes. **Stage Completion** is a one-way latch on `completed_at`, but **Stage Status** keeps moving after. They can still update."

## Flagged ambiguities

- "Status" was used ambiguously between **Stage Status** (per-Stage workflow position) and **Job Lifecycle Status** (Job-level mutability gate). Resolved: distinct concepts on different rows.
- "Job-viewer / job-supervisor" felt like a "split brain" alongside the Role enum — the discomfort came from missing the **Scope** concept. They are not hacks: all three of `job-stage-editor`, `job-supervisor`, `job-viewer` are **Department-Aware**. Whether a User is scoped depends on their Department memberships, not on which of the three Roles they hold.
