# db (@pkg/db)

- Commit generated SQL migrations.
- Do not use `drizzle-kit push` for production-style changes.
- Declare Equipment-owned tables and sequences with `equipmentSchema.table` / `equipmentSchema.sequence`;
  reserve `pgTable` / `pgSequence` for business-blind `public` mechanisms per ADR 0016.
- Keep schema definitions declarative when constraints can express the invariant.
- DB-backed Vitest configs run `src/test-global-setup.ts` to sweep databases from dead test processes,
  then install `src/test-setup.ts` to drain the current file's tracked ephemeral databases in `afterAll`,
  and take `testTimeout`/`hookTimeout` from `databaseTestTimeout` (`src/test-timeout.ts`).

Canonical examples: `src/schema/product.ts`, `src/database-client.ts`, `src/query-utils.ts`.
