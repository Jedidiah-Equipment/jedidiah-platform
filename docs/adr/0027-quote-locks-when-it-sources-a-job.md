# A Quote locks when it sources a Job

Once a Quote sources its Job, it becomes a Locked Quote: a defined set of commercial and identity fields is frozen forever, while post-sale logistics fields remain editable. Because a Quote sources at most one Job (see [ADR-0026](./0026-job-is-the-realization-of-an-accepted-quote.md)), this is a binary state — zero Jobs means an open Quote, one Job means a Locked Quote.

## Decision

Frozen on a Locked Quote: **Product, Customer, Salesperson, selected Optional Assemblies, base price, discount, status, `delivery_included`, `delivery_price`.**

Still editable on a Locked Quote: **`valid_until`, `preferred_delivery_date`, `planned_delivery_date`, `notes`, `payment_terms`.**

The lock is irreversible: Jobs are not deleted (job management is out of scope), and `job.quote_id` is `onDelete: restrict`, so a Locked Quote never reopens. Enforcement is server-side in the Quote update path — attempts to change a frozen field on a Locked Quote are rejected; the UI presents those fields read-only.

## Considered Options

- **Total freeze** (no field editable once locked). Rejected: delivery dates, notes, and payment terms are post-sale logistics that legitimately keep moving after an order is confirmed; freezing them would push that tracking off the Quote.
- **Freeze only the originally-listed six commercial fields, leave status editable.** Rejected: an `accepted` Quote already in fabrication must not be able to revert to `rejected`. Status is the acceptance fact the Job depends on, so it freezes too. `delivery_price`/`delivery_included` were also pulled into the frozen set because they feed Quote Total — the money is fully frozen.

## Consequences

- The set of frozen vs. editable fields is a deliberate split; the editable fields are exactly post-sale logistics and free text.
- "Quote Selected Assemblies are always editable" (previous CONTEXT.md rule) no longer holds — they freeze on lock.
- No reopen path exists. If voiding a Job is ever needed, it is a future slice that must also define how the Quote unlocks.
