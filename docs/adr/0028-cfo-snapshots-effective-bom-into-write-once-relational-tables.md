# The CFO snapshots the Effective BOM into write-once relational tables

When a Job is created, its CFO (Customer Fabrication Order) captures the Quote's Effective Bill of Materials as a frozen snapshot, stored in dedicated relational tables rather than a `jsonb` blob.

## Decision

- Two write-once tables: `job_cfo_assembly(id, job_id → job, assembly_name, kind)` and `job_cfo_part(cfo_assembly_id → job_cfo_assembly, part_id → parts, quantity)`.
- `job_cfo_part.part_id` is a real FK to `parts` (`onDelete: restrict`) — safe because Parts are never deleted, and it makes cross-Job part-demand reporting a clean join.
- `job_cfo_assembly` has **no** FK to `product_assemblies`: it stores `assembly_name` + `kind` as snapshot columns. Assemblies are mutable and deletable on the Product, so the CFO must survive a catalog assembly being renamed or removed.
- Per-assembly content is name + kind only (no price — pricing is frozen on the Quote, not the fabrication document). Per-part content is `part_id` + `quantity` only; the "whole part" is not copied (the dump reads through the live Part for display).
- The snapshot is the Effective BOM: Standard Assemblies not overridden by a selected Optional, plus selected Optionals. Creation is **blocked** if any selected Optional Assembly is stale (its catalog Assembly was deleted), because its Parts cannot be resolved.
- Rows are inserted in the Job-creation transaction and never updated or deleted afterward (except by cascade if the Job itself is removed).

## Considered Options

- **Single `jsonb` column on `job`.** Rejected: although a frozen whole-document snapshot fits JSON well, the business wants relational reporting (e.g. aggregate part demand across open Jobs) and clean joins to `parts` for display. JSON would make those queries painful.
- **FK from `job_cfo_assembly` to `product_assemblies`.** Rejected: it would break or drift when a catalog assembly is later deleted/renamed; the snapshot must be self-contained.

## Consequences

- A frozen snapshot lives in mutable-looking relational tables; they must be treated as write-once. A future reader should not add an edit path.
- `part_id` integrity holds only because Parts are never deleted; if that ever changes, this FK choice must be revisited.
