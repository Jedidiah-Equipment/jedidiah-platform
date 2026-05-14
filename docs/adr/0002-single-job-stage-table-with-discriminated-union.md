# Single `job_stage` Table with Zod-Discriminated-Union Status Typing

All five stages (Procurement, Fabrication, Paint, Assembly, Dispatch) share one `job_stage` table. The `status` column is `text` in the database; value space is validated in app code via a Zod discriminated union keyed on the `stage` column. Per-stage *payload* (purchase orders, cut lists, paint batches, etc.) lives in bespoke per-stage tables that FK to `job_stage`.

## Considered Options

- **One Postgres enum per stage with CHECK constraints** linking enum to discriminator. Rejected: Postgres enum evolution is painful (rename/remove requires migration), and status enums are expected to evolve as shop-floor reality is discovered. The defense-in-depth gain is small relative to the friction.
- **Table-per-stage** (`procurement_stage`, `fabrication_stage`, ...). Rejected: shared workflow concerns (sequencing, gating, completion latch, lifecycle) are identical across stages — splitting them duplicates schema and forks all the workflow code. The legitimate divergence is in *payload*, not in stage-row structure.

## Consequences

- A future engineer reading the wide table may be tempted to split it per stage. The reason not to is that stage-row shape is uniform; only status values and payloads diverge, and both are handled at the right layer (Zod for status, bespoke child tables for payload).
- Status enum changes are code-only (no migration).
- DB-level type safety on status is deliberately not pursued. The boundary that matters — per-stage payload — is properly typed via bespoke tables.
