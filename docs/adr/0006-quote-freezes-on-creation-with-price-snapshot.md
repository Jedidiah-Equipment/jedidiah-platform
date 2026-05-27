# Quote freezes on creation with price snapshot

A Quote requires Customer, Product, Salesperson, and Status at creation. At that moment, the Product's `base_price` and currency are copied onto the Quote as the Quoted Price (`Quote total = Quoted Price − discount`). The Product reference is immutable thereafter; Customer, Salesperson, Optional Assemblies, discount, Payment Terms, Notes, Preferred/Planned Delivery Dates, `valid_until`, and Status remain editable.

A Quote is a commitment shown to a customer: its price must not silently change if the catalogue is re-priced. Latching at creation works because Product is required at creation — there is no "draft without a Product" phase that previously forced the latch to happen on send.

Status (`draft | sent | accepted | rejected`) is a cosmetic label on the Quote. It has no transition rules and no side effects. It is editable freely and is used for display, filtering, and sorting only.

## Considered Options

- **Live price from the Product.** Rejected: re-pricing the Product would retroactively alter every existing Quote.
- **Latch on send (previous design).** Rejected: required a `send` action to exist as a behavioural event, which coupled price-snapshot semantics to status. With Product now required at creation, the send-time latch has no justification.
- **Latch on a manual "lock" action separate from creation.** Rejected: adds a step with no clear trigger; salespeople would forget to lock and the Quote would silently drift.
- **Make Product editable with re-latching on change.** Rejected: silently re-snapshotting the price destroys the customer-facing commitment the snapshot exists to protect.

## Consequences

- The Quote carries a snapshot price column that deliberately duplicates Product data; this is intended, not drift.
- Fixing a wrong Product is a new-Quote operation (delete + recreate), which means a new Quote code.
- Status is purely a label — `sent`, `accepted`, `rejected` no longer mean anything mechanically. Audit Events still capture status edits as ordinary field changes (see ADR 0008).
- `sent_at` is removed; if "when was this marked sent" is needed later, audit events answer it.
