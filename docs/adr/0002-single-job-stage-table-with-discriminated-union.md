# Single `job_stage` Table for All Stages

All five Stages (Procurement, Supply, Fabrication, Paint, Assembly) share one `job_stage` table. Per-Stage *payload* (purchase orders, cut lists, paint batches, etc.) lives in bespoke per-Stage tables that FK to `job_stage`.

Stage rows are intentionally uniform: `job_id`, stage identity, sequence, and timestamps. Richer captured data belongs in future per-Stage child tables, not in the shared row.

## Considered Options

- **Table-per-stage** (`procurement_stage`, `fabrication_stage`, ...). Rejected: shared row shape is uniform across Stages. Splitting duplicates schema and forks all the workflow code. The legitimate divergence is in *payload*, not in stage-row structure.
- **A single payload JSONB column on `job_stage`**. Rejected: payload shapes are heterogeneous, query patterns differ, and bespoke child tables give each Department's payload first-class typing.

## Consequences

- A future engineer reading the wide table may be tempted to split it per stage. The reason not to is that stage-row shape is uniform; payload divergence is handled at the right layer (bespoke child tables).
- Per-Stage payload tables remain the place to add richer captured data (e.g. a Procurement-specific PO table).
