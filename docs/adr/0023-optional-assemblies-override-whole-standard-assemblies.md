# Optional Assemblies Override Whole Standard Assemblies, Many-to-Many

When an Optional Assembly is selected on a Quote, it replaces zero or more *entire* Standard Assemblies. Override is whole-Assembly, not per-Part. One Optional may override many Standards; many Optionals may target the same Standard at the schema level, with conflict prevention pushed to the Quote.

## Context

Optional Assemblies (e.g., "Heavy-duty axle assembly") represent upgrade choices that displace default Standard Assemblies (e.g., "Standard axle assembly") in the effective bill of materials. The data model needs to encode *which* Standards an Optional displaces so a Quote with a selected set of Optionals can resolve the effective BOM unambiguously.

## Decision

- **Whole-Assembly override.** When an Optional is selected and overrides a Standard, the *entire* Standard Assembly drops out of the BOM — all its Parts removed — and the Optional's Parts take its place. There is no part-by-part diffing across Assemblies.
- **0..n target Standards per Optional.** An Optional may displace zero (purely additive), one, or several Standards. A heavy-duty drivetrain Optional, for example, might displace both "Standard axle" and "Standard hubs".
- **Many-to-many at the schema level.** The `assembly_overrides` join allows multiple Optionals to target the same Standard. This is deliberate: an axle Standard might have several upgrade tiers (Heavy-duty, Premium), all targeting it.
- **Conflict prevention lives on the Quote.** Selecting two Optionals that both override the same Standard is ambiguous (which one wins?) and must be rejected by the Quote, not the Product. The Product schema is conflict-permissive; the Quote is conflict-strict.
- **Effective BOM formula.** For a Quote with selection set `S`:
  `effective_bom = (standard_assemblies not overridden by any optional in S) ∪ S`.

## Considered Options

- **Part-level override.** Optionals contain Parts that override specific Parts inside Standard Assemblies. Rejected: requires defining "same Part role" across two Assemblies, handling multi-override conflicts at the Part level, and reasoning about partial Assemblies — none of which the shop floor thinks about. Mechanical drawings and procurement reason in whole assemblies.
- **Single target Standard per Optional.** Rejected: real upgrades genuinely bundle several sub-assemblies. The cost of supporting many is one extra row in the join table.
- **Enforce override exclusivity in the schema** (at most one Optional may override each Standard). Rejected: it would prevent legitimate multi-tier upgrades at the catalog layer. The right place to reject conflicts is the Quote, where the user makes the actual selection.

## Consequences

- Purely-additive Optionals (no overrides — e.g., "Spare tyre mount") are just rows in `product_assemblies` with no rows in `assembly_overrides`. The data model uniformly handles additive and substitutive Optionals.
- The Quote layer becomes responsible for an O(n²)-ish conflict check across selected Optionals. This is acceptable — the selection set is small.
- A Standard Assembly's deletion cascades to remove its references from `assembly_overrides`, leaving the Optional intact but with one fewer override target. An Optional that loses all its targets becomes purely additive — no special handling required.
