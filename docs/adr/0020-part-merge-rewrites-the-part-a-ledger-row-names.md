# A Part Merge Rewrites the Part a Ledger Row Names

A Stock Movement is append-only: it is never edited or deleted. A **Part Merge** is the one sanctioned exception. It re-points every record naming the duplicate at the surviving Part, including `stock_movement.part_id`, `stock_build.built_part_id` and the Part ids inside Job Estimate Snapshot JSON and invoice flag keys. It then deletes the duplicate so its code is free. Only the Part a row names changes; no delta, cost, date or reference moves. The two Parts were always one physical item, so their histories interleave in time. Each ledger drew at its own average until the merge, though, so a bare replay would re-price draws already made; the merge appends a revaluation that sets the survivor's average to the two averages weighted by stock on hand, keeping the stock value both Parts held. This decision follows the Part Merge spec (#1579).

## Considered Options

- **Transfer the stock and keep the history.** Rejected. Paired "merged out" and "merged in" movements would keep the ledger pure, but the duplicate would have to live on in a new retired state that every Part picker, list, CSV import, buy list and stocktake learns to hide. Its open orders, BOMs, Products and Job snapshots would still need re-pointing anyway.
- **Merge only a duplicate with no Stock Movements.** Rejected. It misses the real case: a duplicate noticed after stock was booked against it.

## Consequences

- A merge is refused while the two Parts' quantities would mean different things: a different Unit of Measure, Standard Purchase Length, Stock Tracking Mode, or built versus bought.
- A merge is refused while both Parts share a Purchase Order, while one is in the other's BOM, while the duplicate is on a draft or approved order from another Supplier, and while a stocktake of their scope is open.
- Where one Product, Assembly, BOM or Job CFO lists both Parts, the quantities are added together; the survivor keeps its own BOM, even an empty one, and the duplicate's is dropped.
- A sent order's line may now name a Part of another Supplier. A quantity amendment no longer re-judges the Supplier of a Part already on the order; adding or substituting a line still does.
- A `substitute-part` amendment between the pair ends up naming the survivor on both sides, so the amendment shape no longer requires the two Parts to differ; the amendment input still refuses substituting a Part for itself.
- The duplicate's code stops resolving on printed labels and the stores tablet; there is no code alias. Invoice reviews on the duplicate's old orders match by Part code too, so an invoice printing the old code falls back to supplier code and description matching and may re-flag a line.
- The duplicate's past audit rows stay under its old id; both Parts get a `merged` event.
