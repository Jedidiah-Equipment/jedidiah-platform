# Jedidiah Ops Context

Compact domain map for implementation and planning. Search this file first for names and invariants; read only the sections relevant to the work.

## Core Model

**Job** is one physical product instance created from exactly one accepted **Quote**. Do not call it an Order, Work Order, Build, or Ticket. A Job has a `JOB-xxxxx` code for app use and a **Product Serial Number** for the physical unit.

**Quote** is a sales offer for one **Customer** and one **Product**, owned by one salesperson. A Quote can source at most one Job. Once it does, it becomes a **Locked Quote**: commercial facts stay frozen, while post-sale logistics and notes can still change where the UI allows.

**Customer** means the company buying or receiving the product. Avoid Client or Buyer in code and docs.

**Supplier** is currently a standalone procurement directory record. **Part** is the reusable purchasable item layer. **Assembly** is a Product-owned grouping of Parts, either Standard or Optional. Optional Assemblies carry an upgrade-delta price, may replace whole Standard Assemblies, and are selected on Quotes.

**Quote Pricing** is the computed breakdown — total, discount amount, and live selected Optional Assemblies — projected from a Quote's stored pricing facts. A selection is excluded when stale: a `null` reference on a persisted Quote (`on delete set null`), or unresolved against the loaded catalog while editing. Deposit (a payment term) and VAT (Quote Document only) are not inputs.

**CFO** means Customer Fabrication Order: the Job's frozen bill of materials, snapshotted from the Quote's effective BOM at Job creation.

## Manufacturing

The visual pipeline is fixed: Procurement -> Supply -> Fabrication -> Paint -> Assembly. A **Department** groups **Bays**, but is not an authorization boundary.

**Bay** is a durable physical workspace. Avoid Station, Workstation, Cell, or Machine. Bays are created, renamed, disabled, and re-enabled by admins. Disabled Bays reject new bookings but keep existing schedule history.

**Bay Operator** is a permissionless shop-floor user role. An **Operator Assignment** attaches one Bay Operator to one Bay until unassigned; the current operator is the open assignment interval, not a column on the Bay.

**Product Bay** is a Product's default Bay plus working-day duration. It seeds Job scheduling, but it is not required and does not derive from quote lead time.

## Scheduling

**Bay Queue** is the ordered Slot sequence for one Bay from its `scheduleOrigin`. All queue mutations serialize on the Bay row. Avoid using Schedule for this per-Bay sequence.

**Slot** is a whole-day planning block in a Bay Queue. Avoid Booking, Reservation, Appointment, or Block. A **Work Slot** references one Job. An **Idle Slot** reserves working time without a Job and is distinct from an Off-Day.

Slot dates are derived, never stored on Slots. Projection walks a Bay Queue from the Bay's plant business-date origin, consuming `durationDays` as working days and skipping Off-Days. Derived dates are `yyyy-MM-dd` plant business dates and must read the same in every viewer timezone. Africa/Johannesburg is used only at the server boundary to derive plant "today" and new Bay origins.

**Working Calendar** is explicit dated facts. Unmarked dates are working days. **Off-Days** are explicit non-working dates. **Bay Calendar Exceptions** override the org calendar for one Bay: Overtime opens an otherwise-off day; Bay Closure closes an otherwise-working day. Off-Days are stepped over by projection and are not Idle Slots.

**Insert at Date** is a placement hint, not a stored or pinned start. Under the Bay lock, the chosen date resolves against live projection: inside a Slot splits it, exactly at a Slot start inserts before it, and past the next available day appends. Deliberate deferral beyond the queue end is represented with Idle Slots.

## Commercial Documents

**Document** is an immutable stored file owned by one entity. Avoid File, Attachment, Media, or Asset for the domain object. Documents use private object storage through the API; deleting the row does not delete the stored object. Metadata is immutable and owner-type specific.

**Thumbnail** is separate: a small inline display image for quick recognition.

**Job Document Snapshot** copies the Product's current uploaded Documents onto the Job at Job creation, pointing to the same immutable stored files and freezing metadata. The Brochure is not copied but generated fresh and saved as its own Job Document. Product display names may still read live.

**Quote Document** is a generated customer-facing PDF packet owned by a Quote. The newest created Quote Document is treated as the latest. The Product's Brochure is merged into the packet at generation time.

**Brochure** is a generated customer-facing product marketing PDF produced from a Product's Brochure Config, not an uploaded file. It is generated from live config every time: streamed unsaved when viewed from the Product screen, merged into the Quote Document packet at Quote generation, and saved as a standalone Job Document at Job creation. A saved Brochure is immutable and reflects the config as it was at generation time.

**Brochure Config** is the Product-owned configuration the Brochure is generated from: subtitle, key features (an ordered list of freeform lines), and the range logo, hero, technical drawing, and secondary image slots. The title comes from the Product name, the assembly lists from the Product's Standard and Optional Assemblies, and the body copy from the Product description.

## Access

App Role owns authorization. Department Membership is descriptive only and must not be used to scope permissions.

- **admin**: full access; owns Bay scheduling, calendar updates, Job creation, admin Bay configuration, and Suppliers.
- **procurement-manager**: Customers, Products, Parts, Suppliers, and Job reads; no scheduling mutation.
- **job-viewer**: Job and Bay schedule reads only.
- **sales**: Quote create/read/update.
- **bay-operator**: no app permissions and cannot sign in unless the role gains permissions later.

Server/API checks are the security boundary. Browser access checks are UX only.

## Cross-Cutting

**Audit Event** records boundary-visible changes for Customers, Jobs, Job Bays, Products, Quotes, Suppliers, and Users. Slot create/resize/remove are not audited; Slot reorders are.

**Dashboard** is the single signed-in landing surface. Widgets are permission-gated registry entries, and Dashboard Metrics are computed live rather than stored in reporting tables.

**Job Start Alert** is a visibility signal for an accepted Quote with no Job whose earliest set Preferred/Planned Delivery Date is within two calendar months from the current Johannesburg date.
