# Quote freezes on send and snapshots its price

A Quote moves through a fixed linear lifecycle (`draft → sent → accepted | rejected`).

**At creation**, only `customer_id` is required. Product, price, discount, valid-until, salesperson, and notes are all optional in `draft` — a salesperson can log an enquiry with just a Customer.

**On send**, the Quote's fields (Customer, Product, discount, valid-until, salesperson, notes) are latched immutable, and the referenced Product's `base_price` and currency are copied onto the Quote as the Quoted Price (`Quote total = Quoted Price − discount`). Send validates that Product is set — there must be something to latch. Revisions are made by issuing a new `draft` Quote.

A Quote is a commitment shown to a customer: its terms and price must not silently change if the catalogue is re-priced or someone edits the record.

## Considered Options

- **Editable until accepted.** Rejected: a customer could be looking at terms that no longer match the record.
- **Live price from the Product.** Rejected: re-pricing the Product would retroactively alter every sent Quote.
- **All fields required at creation.** Rejected: forces a salesperson to gather full pricing before logging an enquiry. Customer-only at creation lets enquiry capture happen in seconds.

## Consequences

- The Quote carries a snapshot price column that deliberately duplicates Product data; this is intended, not drift.
- Correcting a sent Quote is a new-Quote operation, not an edit.
- `quote.product_id`, `quoted_price`, and the other latch fields are nullable in `draft` and enforced non-null on send.
- Creating Jobs from Quotes is permitted from `draft`, `sent`, and `accepted` Quotes (see CONTEXT.md's `Create Job from Quote`), but is hidden on `rejected`.
