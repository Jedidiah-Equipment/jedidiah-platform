# Jedidah Ops

Domain language for Jedidah Ops. The core unit is a **Job**: one physical product instance moving through a five-stage manufacturing pipeline.

## Language

**Job**:
The realized build of an accepted Quote — the confirmed order behind it. A Job is always sourced from exactly one Quote; there is no way to create a Job without one. Creating a Job locks the Quote's commercial facts, assigns the physical Product Serial Number for the unit being built, and snapshots its bill of materials (see Create Job from Quote and CFO).
_Avoid_: Order, Work Order, Build, Ticket.

**Product Serial Number**:
The physical unit serial assigned to one Job at creation, formatted as `{productModelCode}{twoDigitYear}{sequence}` (for example `SG1836260009`). The prefix is the Product model code as stored when the Job is created; the year is the Africa/Johannesburg business calendar year; and the sequence is a per-Product running count that continues across years. This is not the Job code: the Job code (`JOB-xxxxx`) remains the app-facing operational identifier, while the Product Serial Number identifies the real product unit.

**Pipeline**:
The fixed manufacturing sequence: Procurement -> Supply -> Fabrication -> Paint -> Assembly. The sequence is for visual ordering and shared language only; it is not a server-side work gate.

**Stage**:
One of the five fixed Pipeline steps. Represented by a `job_stage` row. All five rows are materialized when a Job is created.
_Avoid_: Step, Phase, Task.

**Department-facing Stage Label**:
Stages are labelled for users by their owning Departments: Procurement, Supply, Fabrication, Paint, Assembly. Internally these remain Stages.

**Stage Work State**:
Current Stage state is intentionally minimal (`pending | in-progress | complete`) and defaults to `pending` until the next workflow model replaces it. Do not infer progress from lower-level production resources unless a new workflow contract introduces them.

**CFO (Customer Fabrication Order)**:
The frozen bill of materials for a Job, snapshotted from the Quote's Effective Bill of Materials at the moment the Job is created. It captures the Standard and selected Optional Assemblies (Standards overridden by a selected Optional are excluded) and their Parts. Parts are referenced by id rather than copied: the reference always resolves because Parts are never deleted, and the dump deliberately reflects each Part's *current* code and name — so editing or renaming a Part is intentionally allowed to change how an existing CFO reads. The CFO is the shop-floor build instruction for that one physical unit.
_Avoid_: BOM dump, build order, parts list.

**Quote**:
A sales offer associated with one Customer for one Product, owned by one Salesperson, with an editable Status. Customer, Product, Salesperson, and Status are required at creation. Optional fields cover commercial detail (discount amount, deposit amount, Payment Terms, valid_until, delivery_included, delivery_price), selected Optional Assemblies, delivery expectations (Preferred and Planned Delivery Dates), and internal Notes. The Product's `base_price` and currency are snapshot onto the Quote at creation and never change thereafter; the Product reference itself is also immutable post-creation. A Quote sources at most one Job: while it has none it stays editable, and creating its Job turns it into a Locked Quote (see Create Job from Quote and Locked Quote).

**Quote Status**:
A label on a Quote (`draft | sent | accepted | rejected | cancelled`). Freely editable with no transition rules *until* the Quote sources a Job: a Job can only be created from an `accepted` Quote, and once a Job exists the status (along with the rest of the Locked Quote fields) is frozen. Used for display, filtering, and sorting, and as the eligibility gate for Job creation.

**Locked Quote**:
A Quote that has sourced its Job. Because a Quote sources at most one Job, this is binary: zero Jobs means an open, editable Quote; one Job means a Locked Quote. On a Locked Quote these fields are frozen forever: Product, Customer, Salesperson, selected Optional Assemblies, base price, discount amount, deposit amount, status, delivery inclusion, and delivery price. These remain editable: `valid_until`, Preferred/Planned Delivery Dates, Notes, and Payment Terms (post-sale logistics and free text). The lock is irreversible — Jobs are not deleted, so a Locked Quote never reopens.

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
An Optional Assembly selected on a Quote. The Quote stores a snapshot of the selected Optional Assembly's name and price, plus a nullable reference back to the Product Assembly when it still exists. The snapshot remains on the Quote until explicitly removed, even if the Product Assembly is later deleted or changed. Existing selected snapshots are preserved unchanged on quote edits; newly added catalog Optional Assemblies snapshot their current name and price when saved. Selected assemblies are editable until the Quote becomes a Locked Quote (i.e. until it sources a Job), after which they are frozen.

**Effective Bill of Materials**:
For a Quote with a selected set of currently available Optional Assemblies, the effective BOM is (Standard Assemblies not overridden by any selected Optional) ∪ (selected Optional Assemblies). Deleted or otherwise stale Quote Selected Assemblies remain commercial quote selections, but do not contribute override relationships because there is no current catalog relationship to trust. Selecting two Optional Assemblies that both override the same Standard Assembly is allowed for now.

**Quote Total**:
A client-side projection, not a persisted or server-returned aggregate. Quote totals are computed from the Quote pricing facts: snapshotted Product base price, selected Optional Assembly snapshot prices, discount amount, delivery inclusion, and delivery price. The server stores and returns those inputs, but does not store a selected-option aggregate total or expose a quote `total` field. Deposit amount is stored on the Quote but does not affect this total.

**Create Job from Quote**:
The single way a Job comes into existence. A `job-supervisor` or `admin` triggers it from an `accepted` Quote that has no Job yet ("Generate CFO & Start Job"). The action: assigns the Product Serial Number, snapshots the Quote's Effective Bill of Materials into the Job's CFO, snapshots the Product's Documents onto the Job (see Job Document Snapshot), materializes the five Stages, and turns the Quote into a Locked Quote. A Quote sources at most one Job. Creation is **blocked** if any selected Optional Assembly is stale (its catalog Assembly was deleted), because the CFO cannot resolve that assembly's Parts — the error names the offending assembly. There is no other Job-creation path (Direct Job Creation is retired) and no product-picking step; everything is inherited from the Quote.

**Audit Event**:
Field-level forensic log for boundary-visible changes. Current entity types include `customer`, `job`, `job_stage`, `product`, `quote`, `supplier`, and `user`. Product Assemblies, their Parts lists, and override links are part of the `product` aggregate and audited under the `product` entity — there is no separate `product_assembly` audit entity type.

**Demo User**:
A deterministic seeded auth user for local/staging sign-in and demo-account display. The canonical roster and shared password live in `pkg/domain/src/demo.ts`; database seeding code consumes that roster rather than duplicating demo-user facts.

**Thumbnail**:
An optional, square, display-only image attached to a User, Customer, Supplier, or Product for quick visual recognition. It is distinct from a Document.
_Avoid_: Avatar, Logo, Photo, Image.

**Document**:
An uploaded file owned by exactly one entity (a Product to start — e.g. a Part Book or an SOP; Parts and other entities to follow). Documents are downloadable from the surfaces of their owner. A Product's Documents appear on the Product's own surfaces; the Job page surfaces the Job's frozen copies (the Job Document Snapshot), not the Product's live Documents. A Document has exactly one owner; there is no org-wide or owner-less ("global") Document. A Document is **immutable once uploaded** — there is no in-place edit or replace. Its lifecycle is create and hard delete; to "replace" a Document a user deletes the existing one and uploads again. Filenames are **unique per owner** (case-insensitive); uploading a duplicate filename for the same owner is rejected. Deleting a Document removes its row, but the underlying stored file is **never deleted from storage** and remains forensically recoverable through Audit history. A single stored file may be referenced by more than one Document (see Job Document Snapshot). Distinct from a Thumbnail (small, inline, display-only image).
_Avoid_: File, Attachment, Media, Asset.

**Job Document Snapshot**:
The Product's Documents frozen onto a Job at the moment the Job is created. Created alongside the CFO during Create Job from Quote, it copies the Job's Product's current Documents onto the Job as new Documents pointing at the same stored files. Each snapshotted Document remembers its **source** (the Product it came from) so the Job page can attribute it; the source's display name is read from the live Product (the same intentional drift the CFO accepts). Like the CFO it is a **frozen build record**: read-only forever, and unaffected by later edits or deletions of the Product's Documents. Because stored files are never deleted, a later change to a Product Document never strands the Job's copy. (Snapshotting Part Documents — grouped per Part — is a planned future extension, out of scope for now and additive when it lands; likewise Job-specific document uploads are not part of this snapshot.)

## Relationships

- A **Job** has exactly five **Stages**, one per Department in Pipeline order.
- A **Job** references exactly one **Product** (inherited from its Quote).
- A **Job** references exactly one **Quote**; a **Quote** sources at most one **Job**.
- A **Quote** references one **Customer**, one **Product**, and one **Salesperson** at creation.
- A **Quote** may have zero or more **Quote Selected Assemblies**.
- A **Supplier** currently stands alone as a procurement directory record.
- A **User** has exactly one **App Role** and belongs to zero or more **Departments**.
- A **Document** has exactly one owning entity (a **Product** to start). A **Product** has zero or more **Documents**.
- Creating a **Job** snapshots its **Product**'s **Documents** onto the Job as a frozen **Job Document Snapshot** (see Create Job from Quote).

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
