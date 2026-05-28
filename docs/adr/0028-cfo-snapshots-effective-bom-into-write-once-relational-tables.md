# The CFO snapshots the Effective BOM into write-once relational tables

When a Job is created, its CFO (Customer Fabrication Order) captures the Quote's Effective Bill of Materials as a frozen snapshot, stored in dedicated relational tables rather than a `jsonb` blob.

## Decision

- Two write-once tables: `job_cfo_assembly(id, job_id → job, assembly_name, kind)` and `job_cfo_part(cfo_assembly_id → job_cfo_assembly, part_id → parts, quantity)`.
- `job_cfo_part.part_id` is a real FK to `parts` (`onDelete: restrict`) — safe because Parts are never deleted, and it makes cross-Job part-demand reporting a clean join.
- `job_cfo_assembly` has **no** FK to `product_assemblies`: it stores `assembly_name` + `kind` as snapshot columns, so the CFO survives a catalog assembly being renamed or removed.
- Per-assembly content is name + kind only (pricing lives on the Quote, not the fabrication document). Per-part content is `part_id` + `quantity` only; the dump reads through the live Part for display. Assemblies copy their name because catalog Assemblies can be deleted or renamed; Parts deliberately do not, so editing or renaming a Part changes how an existing CFO reads. This drift is accepted — Parts are never deleted, so the reference always resolves, and the cost of copying part display fields is not worth paying.
- The snapshot is the Effective BOM: Standard Assemblies not overridden by a selected Optional, plus selected Optionals. Creation is **blocked** if any selected Optional Assembly is stale (its catalog Assembly was deleted), because its Parts cannot be resolved; the error names the offending assembly.
- Rows are inserted in the Job-creation transaction and never updated or deleted afterward (except by cascade if the Job itself is removed).

## Decision drivers

- Relational tables (over `jsonb`) so part demand can be aggregated across Jobs in SQL and joined to `parts` for display.
- A frozen snapshot living in mutable-looking tables must be treated as write-once — no edit path.
- `part_id` integrity holds only because Parts are never deleted; if that ever changes, both this FK choice and the read-through-for-display decision must be revisited.
