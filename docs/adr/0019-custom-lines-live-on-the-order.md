# Custom Lines Live on the Order, Not the Ledger

A Purchase Order line may carry no catalogue Part. This **Custom Line** records its own description, free-text unit, optional supplier code, quantity and price. What arrives against it is an **Arrival** recorded on the order, not a Stock Movement. Part Lines continue to use the Part and the stock ledger. This decision follows the Custom Lines spec (#1508).

## Considered Options

- **Quick-add a catalogue Part from the draft.** Rejected. It preserves every existing Part and ledger invariant, but fills the catalogue, stocktake scope and buy list with once-off items the plant explicitly says are not stock. Repeated purchases should become real Parts through the usual catalogue procedure.

## Consequences

- Custom spend does not appear in Job Material Variance or other job-cost views. The order may still link to Jobs and appear in their Documents tab.
- Custom Lines have no Return to Supplier or credit tracking. A reversing Arrival is their correction path.
- An invoice price flag on a Custom Line is dismiss-only; there is no stock value to revalue.
- Custom Lines are received on web only. The stores tablet reaches orders through Parts.
- `purchase_order_line` has a surrogate key for Custom Line identity. The stock ledger's foreign key remains the composite `(purchase_order_id, part_id)` for Part Lines.
- Ticket #1510 introduces Custom Lines on drafts and sent orders; ticket #1511 adds Arrivals. Both must reach production in the same release because a sent custom-only order cannot read Received between them.
