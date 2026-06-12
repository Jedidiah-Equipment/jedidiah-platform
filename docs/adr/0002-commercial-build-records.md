# Commercial and Build Records

A Job is created only from an accepted Quote, and each Quote can source at most one Job. Job creation assigns the Product Serial Number, snapshots build facts, and turns the Quote into a Locked Quote. Locked Quote commercial facts stay frozen; post-sale logistics and allowed notes remain editable where the application exposes them.

Products define Standard and Optional Assemblies. Standard Assemblies are included in the base Product. Optional Assemblies carry upgrade-delta prices, may replace whole Standard Assemblies, and are selected on Quotes. Quote totals project from the stored pricing facts: Product base price, selected Optional snapshot prices, discount, delivery fields, and deposit fields. Deposit percent is a payment term, not a discount or total modifier.

The CFO is the Job's frozen bill of materials. It snapshots the Quote's effective BOM at Job creation and remains the shop-floor build instruction for that physical unit. Part identity remains relational so current Part code/name reads can still resolve through the Part table.

Documents are immutable records owned by one entity. Full-size Documents use private API-proxied object storage; deleting a Document row does not delete the underlying stored object. Metadata is immutable and owner-type specific. Thumbnails are separate small inline display images.

Job Document Snapshot copies the Product's current Documents onto the Job at creation, pointing at the same immutable stored objects and freezing metadata. Quote Documents are generated customer-facing PDF packets owned by Quotes; the newest created Quote Document is treated as the latest.

Audit Events record boundary-visible changes for commercial/build entities. Product Assemblies and their Part lists are part of the Product aggregate for audit purposes.
