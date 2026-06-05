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

**Bay**:
A durable physical workspace that belongs to exactly one Department (for example a Fabrication bay). A Department has zero or more Bays. One person is attached to a Bay. Bays are the resources that Jobs are scheduled onto: each Bay holds an ordered queue of Slots. Not every Department's Bays are scheduled (see Slot).
_Avoid_: Station, Workstation, Cell, Machine.

**Slot**:
A single booking of one Job onto one Bay for a duration, holding a position in that Bay's queue. A Bay's Slots are sequential and never overlap. The same Job may occupy more than one Slot on the same Bay (e.g. work stops and later restarts). A Slot's calendar dates are not its source of truth — they are derived by projecting the Bay's queue forward (see Slot Projection).
_Avoid_: Booking, Reservation, Appointment, Block.

**Slot Projection**:
The read-time computation that turns a Bay's queue of Slots into concrete calendar dates. It walks the Bay's Slots in queue order from the Bay's anchor (its `scheduleOrigin`, defaulting to today): the first Slot starts at the anchor, each later Slot starts where the previous one ends, and a Slot's end is its start plus its duration. Dates are never stored on a Slot — only sequence and duration are. Because dates are derived, a Slot finishing early or late naturally reflows everything after it. Working calendar and buffers will refine this projection later without changing what is stored.

**CFO (Customer Fabrication Order)**:
The frozen bill of materials for a Job, snapshotted from the Quote's Effective Bill of Materials at the moment the Job is created. It captures the Standard and selected Optional Assemblies (Standards overridden by a selected Optional are excluded) and their Parts. Parts are referenced by id rather than copied: the reference always resolves because Parts are never deleted, and the dump deliberately reflects each Part's *current* code and name — so editing or renaming a Part is intentionally allowed to change how an existing CFO reads. The CFO is the shop-floor build instruction for that one physical unit.
_Avoid_: BOM dump, build order, parts list.

**Quote**:
A sales offer associated with one Customer for one Product, owned by one Salesperson, with an editable Status. Customer, Product, Salesperson, and Status are required at creation. Optional fields cover commercial detail (discount amount, deposit percent, Document Notes, valid_until, delivery_included, delivery_price), selected Optional Assemblies, delivery expectations (Preferred and Planned Delivery Dates), and internal Notes. The Product's `base_price` and currency are snapshot onto the Quote at creation and never change thereafter; the Product reference itself is also immutable post-creation. A Quote sources at most one Job: while it has none it stays editable, and creating its Job turns it into a Locked Quote (see Create Job from Quote and Locked Quote).

**Quote Status**:
A label on a Quote (`draft | sent | accepted | rejected | cancelled`). Freely editable with no transition rules *until* the Quote sources a Job: a Job can only be created from an `accepted` Quote, and once a Job exists the status (along with the rest of the Locked Quote fields) is frozen. Used for display, filtering, and sorting, and as the eligibility gate for Job creation.

**Customer**:
The company receiving a Quote or buying a Job. Customer-facing quote details come from the Customer's company name, VAT number, postal address, contact person, phone, and email when present.
_Avoid_: Client, buyer, account, contract person.

**Locked Quote**:
A Quote that has sourced its Job. Because a Quote sources at most one Job, this is binary: zero Jobs means an open, editable Quote; one Job means a Locked Quote. On a Locked Quote these fields are frozen forever: Product, Customer, Salesperson, selected Optional Assemblies, base price, discount amount, deposit percent, status, delivery inclusion, and delivery price. These remain editable: `valid_until`, Preferred/Planned Delivery Dates, internal Notes, and Document Notes (post-sale logistics and free text). The lock is irreversible — Jobs are not deleted, so a Locked Quote never reopens.

**Document Notes**:
Customer-facing free text on a Quote shown in the bottom-left notes area of the Quote Document. It may include payment terms, transport notes, lead time, or other customer-visible quote notes.
_Avoid_: Payment Terms, internal Notes.

**Deposit Percent**:
The numeric percentage of the Quote Total required as a customer deposit. On a Quote Document it is rendered as the Payment Terms line (e.g. "20% deposit required") and does not change the Quote Total.

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
An Optional Assembly selected on a Quote. The Quote stores a snapshot of the selected Optional Assembly's name and price, plus a nullable reference back to the Product Assembly when it still exists. The snapshot remains on the Quote until explicitly removed, even if the Product Assembly is later deleted or changed. Existing selected snapshots are preserved unchanged on quote edits; newly added catalog Optional Assemblies snapshot their current name and price when saved. Stale selected snapshots remain visible as unavailable notes on customer-facing Quote Documents but are excluded from priced line items and the Quote Total. Selected assemblies are editable until the Quote becomes a Locked Quote (i.e. until it sources a Job), after which they are frozen.

**Effective Bill of Materials**:
For a Quote with a selected set of currently available Optional Assemblies, the effective BOM is (Standard Assemblies not overridden by any selected Optional) ∪ (selected Optional Assemblies). Deleted or otherwise stale Quote Selected Assemblies remain commercial quote selections, but do not contribute override relationships because there is no current catalog relationship to trust. Selecting two Optional Assemblies that both override the same Standard Assembly is allowed for now.

**Quote Total**:
A client-side projection, not a persisted or server-returned aggregate. Quote totals are computed from the Quote pricing facts: snapshotted Product base price, selected Optional Assembly snapshot prices, discount amount, delivery inclusion, and delivery price. The server stores and returns those inputs, but does not store a selected-option aggregate total or expose a quote `total` field. Deposit percent is stored on the Quote but does not affect this total.

**VAT Percent**:
The domain-owned value-added tax percentage used by customer-facing Quote Documents. Quote Documents display VAT separately from the Quote Total, which remains the VAT-exclusive subtotal projection.

**Quote Document**:
A generated customer-facing PDF packet of a Quote, owned by that Quote. A Quote may have multiple Quote Documents as the customer asks for changes; each is named as a revision, carries its revision in metadata, and the newest created Quote Document is treated as the latest one. It can be generated from a `draft`, `sent`, or `accepted` Quote, including a Locked Quote, but not from a `rejected` or `cancelled` Quote. It is a point-in-time record of the Quote offer, using the current live Customer details and the Quote Product's latest PDF brochure at generation time, where latest means the newest created Product Document classified as a brochure and stored as a PDF.

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

- A **Job** has exactly five **Stages**, one per Department in Pipeline order.
- A **Job** references exactly one **Product** (inherited from its Quote).
- A **Job** references exactly one **Quote**; a **Quote** sources at most one **Job**.
- A **Quote** references one **Customer**, one **Product**, and one **Salesperson** at creation.
- A **Quote** may have zero or more **Quote Selected Assemblies**.
- A **Quote** may own **Quote Documents**.
- A **Department** has zero or more **Bays**; a Department is scheduled only if it has Bays (first pass: Fabrication only).
- A **Bay** belongs to exactly one **Department** and holds an ordered, non-overlapping queue of **Slots**.
- A **Slot** books one Job's Department **Stage** onto one **Bay**; the same Stage may occupy more than one Slot on a Bay.
- A **Supplier** currently stands alone as a procurement directory record.
- A **User** has exactly one **App Role** and belongs to zero or more **Departments**.
- A **Document** has exactly one owning entity. A **Product** has zero or more **Documents**.
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
