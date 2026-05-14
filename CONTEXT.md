# Domain Glossary

Canonical terms used across the platform. Keep this aligned with code and conversation.

## Workflow

### Job
A single physical product instance being built and shipped through the shop floor. One Job represents one unit. A customer order for 10 units produces 10 Jobs.

A Job moves through a fixed sequence of department-owned stages:
**Procurement → Fabrication → Paint → Assembly → Dispatch**

### Stage
A department-owned phase of a Job's lifecycle. Each stage owns its own dataset and status set on the Job. Stages run generally sequentially (the next stage cannot start until the previous is complete) but a completed stage remains editable by its owning department.

Stages are modelled as first-class rows (one row per stage per Job), not as fields on the Job. Stage-specific payload tables FK to the stage row, not to the Job directly. This makes role-based data separation enforceable at the data boundary and keeps each stage's status set independent.

### Stage Completion
A stage is "complete" when its `completed_at` timestamp is set. Completion is **orthogonal to status**: status reflects current activity, completion is a one-way handoff latch.

Rules:
- Setting `completed_at` is **gated** — the stage must currently be in an allowed pre-completion status (defined per stage).
- Once `completed_at` is set, status may freely change again (e.g. Procurement re-opens to order extra parts), but `completed_at` is **not cleared**.
- A completed stage stays editable by its owning department.
- Downstream stage gating and the "hidden from view" rule both key off `completed_at`, not status.
- `completed_at` is a one-way latch — never cleared by normal workflow. Reversal is an admin concern, not a workflow transition.

### Pipeline
The five stages are a **fixed, non-configurable sequence**: Procurement → Fabrication → Paint → Assembly → Dispatch. Every Job has the same pipeline; no stage is skipped.

When a Job is created, all five `job_stage` rows are inserted in the same transaction with a `sequence` column (1–5). A stage's state is captured by two timestamps:

- `started_at = null, completed_at = null` — not yet active (waiting on previous stage's `completed_at`)
- `started_at = set, completed_at = null` — active
- `started_at = set, completed_at = set` — complete (still editable by owner; hidden from default views)

"Next stage available" is derived: the lowest-sequence stage whose previous stage has `completed_at` set.

### Department
An organisational unit that owns one stage of the pipeline: Procurement, Fabrication, Paint, Assembly, Dispatch. Departments are a **separate authorization axis** from `AppRole`.

A user has:
- An `AppRole` (existing: admin / feature roles like product-editor) — governs feature access (product management, user management, etc.).
- Zero or more **Department memberships** — governs which stage of which Jobs they can see and edit. Multi-department membership is allowed (supervisors, cross-trained staff).

Job-stage visibility/editability is gated by department membership: a `job_stage` row is accessible to a user iff they are a member of that stage's owning department, OR they hold a cross-cutting Job permission (see below), OR they are admin.

Cross-cutting Job permissions (not tied to a department):
- **job-viewer** — read-only visibility across all stages of all Jobs. For salespeople, customer-service, anyone tracking progress.
- **job-supervisor** — read + limited write across all stages. For planners and managers who orchestrate across departments.

### Job Lifecycle Status
The Job row carries a coarse lifecycle status independent of any individual stage's state:

- **active** — normal operation; stage transitions and edits proceed per stage rules.
- **paused** — workflow halted; stages do not advance and no edits are permitted (admin override only). Reversible to `active`.
- **complete** — terminal happy-path state. Entered automatically when Dispatch reaches its final status (Delivered) and its `completed_at` is set. Job is read-only.
- **cancelled** — terminal unhappy-path state. Set explicitly. Job is read-only.

Stage-level progress (which stage is active, which are complete) is **derived from stage rows** — the Job does not store a `current_stage` pointer. The only stage-to-job write is the automatic `active → complete` transition when Dispatch completes.

### Stage Payload
Each stage's work-content (purchase orders, cut lists, paint batches, assembly checklists, dispatch shipments, etc.) lives in **bespoke per-stage tables**, each FK'd to the relevant `job_stage` row. No JSONB blobs; no generic payload table. This is consistent with the existing repo style (`product`, `product_option` etc.) and makes each stage's data properly typed, queryable, and auditable.

The initial skeleton (Job + five `job_stage` rows + workflow gating + permissions + lifecycle) ships without any stage-payload tables. Each department's payload tables land when that department's feature is built out.

### Completed-Stage Visibility
"Hidden once complete" is a **UI/query-default convention only** — no flag is stored in the database. The stage row's lifecycle is captured entirely by `started_at` and `completed_at`.

Rules:
- Default list/dashboard views filter on `completed_at IS NULL`.
- A "show completed" toggle / `includeCompleted` query parameter reveals them.
- Who can see a completed stage does **not change** post-completion — anyone who had access while it was active retains access after.
- Detail views (clicking through to a specific Job) always show the full pipeline regardless of completion.

### Stage Status Typing
All five stage rows share a single `job_stage` table. The `status` column is `text` in the database; the value space depends on the row's `stage` discriminator.

- Validation is **app-layer**, via a Zod discriminated union on `stage` — each stage variant declares its own `status` enum.
- The database is *not* the type-safety boundary for status. Bespoke per-stage payload tables (which FK to `job_stage`) are.
- Status enums are expected to evolve; keeping them in app code avoids a migration per business-rule change.

This keeps shared workflow concerns (sequencing, gating, completion latch, lifecycle) in one table while letting status semantics vary per stage.

### Scope (Current)
This feature builds the production-floor lifecycle of a Job — Job + five stage rows + workflow + permissions + lifecycle status. **Customers and Quotes are not in scope** and will be built later; no placeholder columns are added in advance. When those features arrive, migrations introduce the FKs at that time.

A Job carries a required FK to `product` (a Job is a Product instance). It does not currently reference a customer or order.

### Job-Level Lifecycle Does Not Cascade to Stages
`job.lifecycle_status` is the **single source of truth** for Job-level state. Stage rows do not gain `paused_at` / `cancelled_at` columns and do not mirror Job lifecycle.

When a Job is `paused` or `cancelled`, stage rows are **untouched**:
- An in-flight stage retains its `started_at` and its current status — preserving an honest historical record.
- A completed stage stays completed.
- Stages that hadn't started stay un-started.

Enforcement that no work happens while a Job is non-`active` lives at the **UI and API guard layers**, not in stage data. Mutation endpoints check `job.lifecycle_status === 'active'` before permitting any stage write; the UI disables controls accordingly. This keeps stage rows clean and avoids un-cascading on resume from pause.

### Workflow Events
Two separate logs capture history; they answer different questions.

- **`AuditEvent`** (existing, generic) — forensic field-level log: who changed which field, from what to what, when. Extended with new entity types: `job`, `job_stage`, and later per-stage payload entities. Same shape as today's `product` auditing.
- **`job_event`** (new, workflow-meaningful) — typed domain events: `stage.started`, `stage.status_changed`, `stage.completed`, `job.paused`, `job.resumed`, `job.cancelled`, `job.completed`. Payload is JSONB (validated by Zod per event type); columns are `id, job_id, stage_id?, event_type, payload, actor_user_id, occurred_at`.

Both writes happen in the same transaction as the state change. The workflow-history UI reads from `job_event`; the forensic-audit UI reads from `AuditEvent`.
