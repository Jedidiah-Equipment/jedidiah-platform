# Quote freezes on send and snapshots its price

A Quote moves through a fixed linear lifecycle (`draft → sent → accepted | rejected`). On send, its fields (Customer, Product, discount, valid-until, salesperson, notes) are latched immutable, and the referenced Product's `base_price` and currency are copied onto the Quote as the Quoted Price; the quote total is `Quoted Price − discount`. We chose this over keeping a sent Quote editable, or computing its price live from the Product, because a Quote is a commitment shown to a customer — its terms and price must not silently change if the catalogue is re-priced or someone edits the record. Revisions are made by issuing a new `draft` Quote.

## Considered Options

- **Editable until accepted** — rejected: a customer could be looking at terms that no longer match the record.
- **Live price from the Product** — rejected: re-pricing the Product would retroactively alter every sent Quote.

## Consequences

- The Quote carries a snapshot price column that deliberately duplicates Product data; this is intended, not drift.
- Correcting a sent Quote is a new-Quote operation, not an edit.
