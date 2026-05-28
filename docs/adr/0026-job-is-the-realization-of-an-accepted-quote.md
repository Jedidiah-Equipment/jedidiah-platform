# A Job is the realization of an accepted Quote

A Job is the confirmed build behind a single accepted Quote. Every Job is sourced from exactly one Quote (`job.quote_id` is `NOT NULL`), a Quote sources at most one Job (`UNIQUE` on `job.quote_id`), and a Job can only be created when the Quote's status is `accepted`. There is no other way to create a Job.

## Decision

- `job.quote_id` is `NOT NULL` with a `UNIQUE` index — the database enforces both "always from a Quote" and "at most one Job per Quote".
- Job creation is rejected unless the source Quote's status is `accepted`.
- The Product's `base_price` and currency are snapshotted onto the Quote at creation and never change.

## Consequences

- Quote status gates Job creation, so it is load-bearing at that moment; what happens to the Quote afterward is covered by [ADR-0027](./0027-quote-locks-when-it-sources-a-job.md).
- The build's bill of materials is captured separately; see [ADR-0028](./0028-cfo-snapshots-effective-bom-into-write-once-relational-tables.md).
