# A Customer Merge Renames the Customer a Transfer Names

A **Customer Merge** re-points every Quote and Ownership Transfer naming the duplicate at the surviving Customer, then permanently deletes the duplicate. Only the Customer a Transfer names changes: no Transfer is added, removed or reordered, and its date, source Quote, actor and note stay unchanged. A Transfer between the pair becomes survivor → survivor and stays as history. This follows the Customer Merge spec (#1601) and preserves the reassigned Unit in #1598.

A Transfer's `sourceQuoteId` is durable proof that its Quote is Locked even after Reassignment takes the Job elsewhere. The Transfer deciding the Owner also supplies the sale facts for the Unit Stock Export and Reassignment, and decides whether cancelling an Allocation Quote returns the machine to Stock. Keeping every row preserves all three meanings.

## Considered Options

- **Delete Transfers that become self-moves.** Rejected. This can unlock a vacated Quote, shift sale facts to an older Quote, or let cancelling an older Allocation Quote reverse a later sale.
- **Refuse a merge when a Transfer names both Customers.** Rejected. This blocks the MRB Farming case that needs the feature.

## Consequences

- The `product_unit_ownership_transfer_moves_owner` database check is dropped. `ProductUnitOwnerUnchangedError` remains the guard on new Transfers; Reassignment explicitly skips a Transfer between deals of the same Customer. Only a merge can produce survivor → survivor history; no writer produces Stock → Stock.
- Quote Documents already generated remain immutable and retain the printed Customer name.
- Earlier audit events remain under the duplicate's id. Both Customers receive a `merged` event, and filling empty survivor contact fields adds an `updated` event.
- Stale App Links to the deleted duplicate stop resolving.
- Merge takes Quote, Unit and Customer row locks with `NOWAIT`: a contended attempt rolls back and retries with jitter for up to ten seconds, then returns a retryable conflict. References are scanned again under the Customer locks to catch newly committed references before any writes. This avoids holding a Quote while waiting on a Unit writer or a Customer removal that needs that Quote.
