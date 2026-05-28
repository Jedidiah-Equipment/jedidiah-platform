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
A sales offer associated with one Customer for one Product, owned by one Salesperson, with an editable cosmetic Status. Customer, Product, Salesperson, and Status are required at creation. Optional fields cover commercial detail (discount, Payment Terms, valid_until), selected Optional Assemblies, delivery expectations (Preferred and Planned Delivery Dates), and internal Notes. The Product's `base_price` and currency are snapshot onto the Quote at creation and never change thereafter; the Product reference itself is also immutable post-creation. A Quote may source any number of Jobs; creating a Job never consumes or converts the Quote.

**Quote Status**:
A cosmetic label on a Quote (`draft | sent | accepted | rejected`). Freely editable, with no transition rules and no side effects. Used for display, filtering, and sorting only.

**Payment Terms**:
Customer-facing free text on a Quote describing how and when the customer pays (e.g. "30% deposit, balance on delivery"). Shown on the Quote document.
_Avoid_ putting internal context here — use Notes for that.

**Preferred Delivery Date**:
The date the customer would like delivery. Optional, captured by the salesperson from the customer's ask. No enforced relationship to Planned Delivery Date — Planned may be earlier, later, or equal.

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
An Optional Assembly selected on a Quote. The Quote stores a snapshot of the selected Optional Assembly's name and price, plus a nullable reference back to the Product Assembly when it still exists. The snapshot remains on the Quote until explicitly removed, even if the Product Assembly is later deleted or changed. Existing selected snapshots are preserved unchanged on quote edits; newly added catalog Optional Assemblies snapshot their current name and price when saved. Selected assemblies are always editable, regardless of Quote Status.

**Effective Bill of Materials**:
For a Quote with a selected set of currently available Optional Assemblies, the effective BOM is (Standard Assemblies not overridden by any selected Optional) ∪ (selected Optional Assemblies). Deleted or otherwise stale Quote Selected Assemblies remain commercial quote selections, but do not contribute override relationships because there is no current catalog relationship to trust. Selecting two Optional Assemblies that both override the same Standard Assembly is allowed for now.

**Quote Total**:
A client-side projection, not a persisted or server-returned aggregate. Quote totals are computed from the Quote pricing facts: snapshotted Product base price, selected Optional Assembly snapshot prices, discount, delivery inclusion, and delivery price. The server stores and returns those inputs, but does not store a selected-option aggregate total or expose a quote `total` field.

**Create Job from Quote**:
A `job-supervisor` or `admin` can create a Job from any Quote. The Job keeps an optional `quote_id` reference. Quote Status does not gate this action (see ADR 0006 and the to-be-revisited note on ADR 0018).
Quote Selected Assemblies do not yet snapshot into Jobs. Base Assembly snapshotting when the first Job is created from a Quote is a separate future slice.

**Direct Job Creation**:
Creating a Job without a Quote. The form asks for Product and optional Job Due Date.

**Audit Event**:
Field-level forensic log for boundary-visible changes. Current entity types include `customer`, `job`, `job_stage`, `product`, `quote`, `supplier`, and `user`. Product Assemblies, their Parts lists, and override links are part of the `product` aggregate and audited under the `product` entity — there is no separate `product_assembly` audit entity type.

**Thumbnail**:
An optional, square, display-only image attached to a User, Customer, Supplier, or Product for quick visual recognition. It is distinct from any future full-size image or document-style media.
_Avoid_: Avatar, Logo, Photo, Image.

## Relationships

- A **Job** has exactly five **Stages**, one per Department in Pipeline order.
- A **Job** references exactly one **Product**.
- A **Job** may reference one **Quote**.
- A **Quote** references one **Customer**, one **Product**, and one **Salesperson** at creation.
- A **Quote** may have zero or more **Quote Selected Assemblies**.
- A **Supplier** currently stands alone as a procurement directory record.
- A **User** has exactly one **App Role** and belongs to zero or more **Departments**.

## Access

**admin**:
Department-blind access to all application resources.

Can read, create, and update Suppliers.

**job-supervisor**:
Can read, create, and update Jobs; can read Products and Quotes.

**job-department-manager**:
Can read Jobs and read/update Stage-level surfaces according to Department scope.

**product-editor**:
Can read, create, and update Products.

**sales**:
Can read, create, and update Quotes.
