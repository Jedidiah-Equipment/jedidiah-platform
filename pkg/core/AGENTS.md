# core (@pkg/core)

- Put domain behavior here when it should not live in Fastify, tRPC, or React.
- Do not depend on browser code, Fastify setup, Better Auth handlers, database clients, or direct `process.env`.
- Shape related data in the owning service query using Drizzle relational `with` where practical; avoid router/API follow-up queries for core-owned reads.
- Export feature-specific errors and type guards beside the behavior that raises them.
- Name a partial update `patchXxxx` (paired with a `XxxxPatchInput` schema). A patch reads the current row under the same `.for('update')` lock as the write and merges only the provided fields — `undefined` keeps the current value, an explicit `null` clears a nullable field. Use it instead of a caller-side get-then-merge, which reads outside the lock and can revert a concurrent edit to an omitted field. Reserve `updateXxxx` for full-replacement writes. See `patchQuote` / `patchCustomer`.

Canonical examples: `src/products/product-service.ts`, `src/products/product-errors.ts`, `src/auth/authorization.ts`.
