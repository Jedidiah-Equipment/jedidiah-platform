# Product Assemblies in a Single Discriminated Table

All Product sub-assemblies — Standard and Optional — share one `product_assemblies` table with a `kind` discriminator column (`'standard' | 'optional'`). Kind-specific invariants are enforced declaratively via CHECK constraints and a composite-FK trick on the override join.

## Context

The new Product schema replaces the flat `product_options` model with two related shapes: Standard Assemblies (always in the BOM) and Optional Assemblies (selectable, may override Standards). Both carry the same core fields — `product_id`, `name`, and a list of Parts with quantities. They diverge only in: (a) Optionals carry a `price` (upgrade delta); (b) Optionals point at zero or more Standards they override when selected.

## Decision

- **One table**: `product_assemblies(id, product_id, kind, name, price, …)` with `kind ∈ {'standard', 'optional'}`.
- **CHECK constraints enforce kind-specific rules.** Notably: `price IS NOT NULL` iff `kind = 'optional'`, and `price >= 0` when present.
- **One `assembly_parts(assembly_id, part_id, quantity)` join.** Both kinds share it. Quantity is an integer `> 0`; primary key is `(assembly_id, part_id)`; cascade on assembly delete, restrict on part delete.
- **`assembly_overrides(optional_assembly_id, standard_assembly_id)` self-references `product_assemblies`.** A composite unique index `(id, product_id, kind)` on `product_assemblies` lets both override FKs include the constants `'optional'` and `'standard'` plus a shared `product_id`. This single declarative constraint enforces both kind-correctness (Optionals only override Standards) and the same-product invariant (an Assembly cannot override one on a different Product) with no triggers.
- **Audit aggregates at `product`.** Assemblies, their Parts lists, and overrides are part of the `product` aggregate. No `product_assembly` audit entity type.

## Considered Options

- **Two tables: `product_standard_assemblies` and `product_optional_assemblies`.** Rejected: the parts-quantity rows would either need duplicated join tables or a discriminator anyway — the discriminator leaks in either way. Cross-cutting queries become UNIONs. Shared field evolution (e.g., a future column on every Assembly) duplicates work.
- **Single table with triggers instead of composite FK.** Rejected: triggers are non-declarative, easy to forget about when reading the schema, and harder to reason about under concurrent writes. The composite-FK trick achieves the same guarantee declaratively.
- **Keep per-kind audit entity types (`product_assembly`, `assembly_part`, `assembly_override`).** Rejected: these rows are not aggregate roots. Operators reason about *the Product*. Three audit streams to answer "what changed on Trailer Model X" is the wrong shape.

## Consequences

- A future engineer reading `assembly_overrides` will see FK columns with embedded constants and a redundant `product_id` on each side. The reason is the kind-and-same-product invariant — not a normalisation mistake.
- Adding a third Assembly kind later is a CHECK-constraint and discriminator-enum change, plus a new constant in the override FK if it participates in overrides.
- Sharing one table aligns with ADR-0002 (single `job_stage` table) — composite shape inside an aggregate, single discriminator outside.
