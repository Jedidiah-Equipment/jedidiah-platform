# Optional Assembly `price` Is the Upgrade Delta, Not an Absolute Price

The `price` column on an Optional Assembly stores the *additional* amount added to the Product's `base_price` when the Optional is selected on a Quote. It is never the Optional's absolute cost. Standard Assemblies carry no price — their cost is rolled into the Product's `base_price`.

## Context

Optional Assemblies replace one or more Standard Assemblies when selected. Standards have no price column; their cost is implicit in the Product's `base_price`. An Optional's price must therefore mean *one* specific thing — either the absolute price of the Optional (with the displaced Standard's cost subtracted somewhere) or the *net* delta added to `base_price`. These two interpretations look identical in single-cell entry but produce wildly different quote totals once teams forget which one is in effect.

## Decision

- **Optional `price` is the upgrade delta.** Quote arithmetic is:
  `quote_line_price = product.base_price + Σ selected_optional.price`.
- **No "subtract the displaced Standard's price" step.** Standards have no price to subtract from. The delta already represents the net upcharge.
- **`price >= 0`.** No downgrade rebates. If a real "downgrade Optional" need emerges, it gets modelled explicitly rather than via negative prices.
- **Currency is inherited from the Product.** No `currency_code` column on `product_assemblies`. Multi-currency within one Product is out of scope.
- **Standards have `price = NULL`,** enforced by CHECK constraint (see [0022](0022-product-assemblies-single-discriminated-table.md)).

## Considered Options

- **Absolute substitute price.** The Optional's price is its full cost; the system subtracts the displaced Standard's cost. Rejected: requires Standards to have a price column, doubling the cardinality of the "cost of this Product" question (base_price *and* per-Standard prices). The delta interpretation collapses to one source of truth.
- **Additive line item regardless of override.** Equivalent to upgrade-delta arithmetically when Standards have no cost column, so this is the same decision under a different name. Codified as "upgrade delta" because it names the *meaning* the team has to maintain.
- **Allow negative prices for rebates / downgrade Optionals.** Rejected: introduces sign-handling everywhere downstream. The use case is hypothetical and can be added explicitly later if real.

## Consequences

- Pricing discipline: the team must price Optionals as the *net* upcharge over the Standard they displace, not as their absolute build cost. UI labels, admin documentation, and any future product-editor tooling should reinforce this.
- Quote pricing logic stays trivial: a single sum, no subtraction.
- Getting this wrong silently — entering absolute prices instead of deltas — produces quotes that over-charge by the displaced Standard's cost. This is a *known* failure mode and worth a visible UI hint near the price input.
