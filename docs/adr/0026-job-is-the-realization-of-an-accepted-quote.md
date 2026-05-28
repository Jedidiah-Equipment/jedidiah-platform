# A Job is the realization of an accepted Quote

A Job is now defined as the confirmed build behind a single accepted Quote, not a free-standing production unit. Every Job is sourced from exactly one Quote (`job.quote_id` is `NOT NULL`), a Quote sources at most one Job (`UNIQUE` on `job.quote_id`), and a Job can only be created when the Quote's status is `accepted`. There is no other way to create a Job: Direct Job Creation (stock builds, R&D, warranty rebuilds with no Quote) is retired, and Job `status` and `due_date` are removed entirely.

This supersedes **ADR-0003**, **ADR-0006**, **ADR-0018**, and **ADR-0021** (all deleted).

## Context

The previous model treated a Job as a production-floor unit that *may* originate from a Quote (ADR-0018: one Quote → many Jobs; Direct Jobs allowed), with a manual `status` lifecycle (ADR-0021) decoupled from stages (ADR-0003), and a Quote status that was purely cosmetic (ADR-0006). The business reality is simpler and stricter: a Job *is* an accepted Quote going into fabrication. One quote, one build, gated on acceptance.

## Decision

- `job.quote_id` is `NOT NULL` with a `UNIQUE` index — the database enforces both "always from a Quote" and "at most one Job per Quote".
- Job creation is rejected unless the source Quote's status is `accepted`. Quote status is therefore load-bearing (it gates this action) — reversing ADR-0006's "status has no side effects".
- Job `status` and `due_date` columns, types, services, endpoints, filters, sorts, and UI are removed.
- The Product's `base_price` and currency are still snapshotted onto the Quote at creation and never change (the still-valid half of ADR-0006, carried forward here).
- Existing Job rows are dropped in the migration — there is no legacy Job data to preserve, so the new invariants apply with no carve-outs.

## Considered Options

- **Keep one-Quote-to-many-Jobs (ADR-0018).** Rejected: a single accepted Quote corresponds to a single physical build in this business; the 1:many model added cardinality nobody used.
- **Keep Direct Job Creation for internal builds.** Rejected: the locked-Quote and CFO-snapshot model only makes sense with a Quote present. Internal builds, if ever needed, can use a throwaway Quote or a future dedicated slice.
- **Keep manual Job status.** Rejected: out of scope for the current model; job management is deferred, so a manual lifecycle field has no consumer.

## Consequences

- Re-introducing 1:many or Direct Jobs later would again require schema and data changes — this reverses ADR-0018 deliberately.
- Quote status now has a real side effect; see [ADR-0027](./0027-quote-locks-when-it-sources-a-job.md) for what happens to the Quote once a Job exists.
- The build's bill of materials is captured separately; see [ADR-0028](./0028-cfo-snapshots-effective-bom-into-write-once-relational-tables.md).
