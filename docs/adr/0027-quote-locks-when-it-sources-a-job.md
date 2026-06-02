# A Quote locks when it sources a Job

Once a Quote sources its Job, it becomes a Locked Quote: a defined set of commercial and identity fields is frozen forever, while post-sale logistics fields remain editable. Because a Quote sources at most one Job, this is a binary state — zero Jobs means an open Quote, one Job means a Locked Quote.

## Decision

Frozen on a Locked Quote: **Product, Customer, Salesperson, selected Optional Assemblies, base price, discountAmount, depositPercent, status, deliveryIncluded, deliveryPrice.**

Still editable on a Locked Quote: **`valid_until`, `preferred_delivery_date`, `planned_delivery_date`, `notes`, `document_notes`.**

The frozen set is everything that defines the confirmed deal — what is built, for whom, by whom, at what price, and the acceptance fact (status). The editable set is post-sale logistics and free text, which legitimately keep moving after an order is confirmed.

The lock is irreversible: Jobs are not deleted, and `job.quote_id` is `onDelete: restrict`, so a Locked Quote never reopens. Enforcement is server-side in the Quote update path — attempts to change a frozen field on a Locked Quote are rejected; the UI presents those fields read-only.

## Consequences

- No reopen path exists. If voiding a Job is ever needed, it is a future slice that must also define how the Quote unlocks.
