# Audit as a Declared Side Effect

## Problem

`createProduct` and `updateProduct` in `pkg/core/src/products/product-service.ts` call `insertAuditEvent()` directly inside `database.transaction()`. Audit is a hardcoded cross-cutting concern embedded in the product mutation. There is no seam between "persist a product" and "record what happened."

Consequences:
- Cannot test a product mutation without an audit table present
- Cannot add a new entity with auditing without copy-pasting the `insertAuditEvent` call pattern
- Audit schema changes (e.g. new fields) require editing `product-service.ts`
- Cannot disable or defer auditing without modifying the service

**Deletion test**: deleting the `insertAuditEvent` calls makes the complexity reappear in every future mutation. It was earning its keep — just at the wrong layer.

## Files

- `pkg/core/src/products/product-service.ts` (lines 121–129, 186–194)
- `pkg/core/src/audit/audit-service.ts`

## Solution

Introduce an `onMutated` callback as a parameter to `createProduct` and `updateProduct`. The default adapter calls `insertAuditEvent`; tests pass a no-op. The product service stops importing from `audit-service` entirely.

```ts
type MutationAuditHook = (tx: Database, event: AuditEventInput) => Promise<void>;

export async function createProduct(
  database: Database,
  input: ProductCreateInput,
  actorUserId: string | null,
  onMutated: MutationAuditHook = insertAuditEvent,
): Promise<Product>
```

The seam for "what happens after a mutation" becomes explicit and swappable at the call site.

## Benefits

- **Locality**: audit logic lives entirely in the audit module; `product-service` has no knowledge of it
- **Leverage**: adding audit to a new entity requires wiring a hook, not editing the service
- **Tests**: product mutations can be tested without an audit table; audit can be tested independently against the hook interface
- **Seam**: one adapter = hypothetical seam. Two adapters (real + no-op) = real seam
