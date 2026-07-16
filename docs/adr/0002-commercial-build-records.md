# Commercial and Build Records

A Job is created from exactly one Quote, and a Quote can source at most one Job. Product Quotes can source a Product Job only once accepted; Product Job creation assigns the Product Serial Number, snapshots build facts, creates the CFO, snapshots Product Documents, generates the Brochure when complete, and turns the Quote into a Locked Quote. Custom Quotes are productless sales offers with a Work Title and entered base price; draft, sent, and accepted Custom Quotes can source a Custom Job. Custom Jobs use the Quote Work Title as their display name and have no Product, Product Serial Number, CFO, starting Job Documents, Brochure, or VIN requirement. Locked Product Quote commercial facts stay frozen once a Job exists; Custom Quote commercial facts stay editable until acceptance.

Products define Standard and Optional Assemblies. Standard Assemblies are included in the base Product. Optional Assemblies carry upgrade-delta prices, may replace whole Standard Assemblies, and are selected on Product Quotes. Quote totals project from stored pricing facts: Product base price or Custom Quote base price, selected Optional snapshot prices for Product Quotes, line items, discount, delivery fields, and deposit fields. Deposit percent is a payment term, not a discount or total modifier.

The CFO is a Product Job's frozen bill of materials. It snapshots the Product Quote's effective BOM at Job creation and remains the shop-floor build instruction for that physical unit. Custom Jobs have no CFO. Part identity remains relational so current Part code/name reads can still resolve through the Part table.

Documents are owner-scoped records whose stored content and metadata are immutable. Full-size Documents use private API-proxied object storage; deleting a Document row does not delete its stored object. Metadata is owner-type specific. Thumbnails are separate small inline display images.

A Product Job's initial Documents collection consists of snapshot copies of the Product's current uploaded Documents plus a freshly generated Brochure when the Brochure Config is complete. Snapshot rows point to the same stored objects as their Product Documents and freeze the metadata. The saved Brochure reflects the generation-time config. Custom Jobs start with an empty Documents collection and do not generate a Brochure.

After creation, both Product and Custom Jobs may accumulate any number of uploaded Purchase Orders. Job uploads accept PDFs only, capture no metadata beyond the server-forced `purchase_order` type, and require `job:update`. Purchase Orders can be deleted by users with `job:update`; snapshot Documents and the Brochure remain immutable and reject deletion. Web owns upload and deletion. Mobile lists, downloads, and shares every Job Document read-only.

Quote Documents are generated customer-facing PDF packets owned by Quotes; the newest created Quote Document is treated as the latest.

Audit Events record boundary-visible changes for commercial and build entities. Product Assemblies and their Part lists are part of the Product aggregate for audit purposes.
