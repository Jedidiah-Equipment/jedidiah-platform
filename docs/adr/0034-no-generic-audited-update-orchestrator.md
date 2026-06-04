# No generic audited-update orchestrator

Each entity's update service keeps its own hand-written transaction body — lock-read, diff, skip-if-unchanged, write, emit audit, return — rather than routing through a shared `auditedUpdate(tx, descriptor, …)` helper. The read-diff-write-audit rhythm looks repeated, but only `updateCustomer` is the pure spine; every other path injects aggregate-specific steps (unique-violation mapping, foreign-key prechecks, related-collection load/resolve/sync for Product Assemblies and Quote Selected Assemblies, column remaps, re-read-with-joins return shapes), so a single interface would need so many hooks that it would be as complex as the code it hides. The audit *emission* is already deepened behind the descriptor engine (`diffAuditUpdate` / `recordAuditUpdate`); that is the seam worth having, and the surrounding control flow stays in the feature.

## Consequences

- The Locked Quote gate stays visible in `updateQuote` where ADR-0027 wants it, not buried in a shared orchestrator.
- Feature-owned error mapping (`mapXUniqueViolation`) stays near each router/service per ADR-0009.
- The structural similarity between update services is accepted as rhythm, not treated as duplication to extract. Architecture reviews should not re-propose a generic audited-write/update orchestrator.
