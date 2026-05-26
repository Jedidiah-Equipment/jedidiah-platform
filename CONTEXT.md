# Jedidah Ops

Domain language for Jedidah Ops. The core unit is a **Job**: one physical product instance moving through a five-stage manufacturing pipeline.

## Language

**Job**:
The unit of production-floor tracking. A Job may originate from a Quote or be created directly for stock builds, R&D, warranty rebuilds, or similar internal work.
_Avoid_: Order, Work Order, Build, Ticket.

**Pipeline**:
The fixed manufacturing sequence: Procurement -> Supply -> Fabrication -> Paint -> Assembly. The sequence is for visual ordering and shared language only; it is not a server-side work gate.

**Stage**:
One of the five fixed Pipeline steps. Represented by a `job_stage` row. All five rows are materialized when a Job is created.
_Avoid_: Step, Phase, Task.

**Department-facing Stage Label**:
Stages are labelled for users by their owning Departments: Procurement, Supply, Fabrication, Paint, Assembly. Internally these remain Stages.

**Job Due Date**:
A single optional date on the Job (`due_date`). It is a manually set deadline marker and has no computed relationship to Stage rows.

**Job Status**:
A manually stored field on the Job: `pending | active | paused | complete | cancelled`. It is used for display, filtering, sorting, and supervisor-controlled workflow communication. It does not mutate Stage rows.

**Stage Work State**:
Current Stage state is intentionally minimal (`pending | in-progress | complete`) and defaults to `pending` until the next workflow model replaces it. Do not infer progress from lower-level production resources unless a new workflow contract introduces them.

**Quote**:
A sales offer associated with one Customer, optionally specifying a Product, price, discount, and validity window. A Quote may source any number of Jobs; creating a Job never consumes or converts the Quote.

**Create Job from Quote**:
A `job-supervisor` or `admin` can create a Job from a Quote while the Quote is `draft`, `sent`, or `accepted`. Rejected Quotes cannot source Jobs. The Job keeps an optional `quote_id` reference.

**Direct Job Creation**:
Creating a Job without a Quote. The form asks for Product and optional Job Due Date.

**Audit Event**:
Field-level forensic log for boundary-visible changes. Current entity types include `customer`, `job`, `job_stage`, `product`, `product_option`, `quote`, and `user`.

## Relationships

- A **Job** has exactly five **Stages**, one per Department in Pipeline order.
- A **Job** references exactly one **Product**.
- A **Job** may reference one **Quote**.
- A **Quote** references one **Customer**, optionally one **Product**, and one **Salesperson** when sent.
- A **User** has exactly one **App Role** and belongs to zero or more **Departments**.

## Access

**admin**:
Department-blind access to all application resources.

**job-supervisor**:
Can read, create, and update Jobs; can read Products and Quotes.

**job-department-manager**:
Can read Jobs and read/update Stage-level surfaces according to Department scope.

**product-editor**:
Can read, create, and update Products.

**sales**:
Can read, create, and update Quotes.
