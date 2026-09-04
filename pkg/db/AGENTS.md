# db (@pkg/db)

- Commit generated SQL migrations.
- Do not use `drizzle-kit push` for production-style changes.
- Declare Equipment-owned tables and sequences with `equipmentSchema.table` / `equipmentSchema.sequence`;
  reserve `pgTable` / `pgSequence` for business-blind `public` mechanisms per ADR 0016.
- `FOR UPDATE OF` on a schema-qualified table needs an `aliasedTable`: Postgres rejects qualified names in
  the `OF` list (see `pkg/core/src/equipment/units/product-unit-reassignment.ts`).
- Folder is entrypoint: `src/schema/equipment/` ships through `@pkg/db/equipment`, shared `src/schema/*.ts`
  through `@pkg/db`; `src/schema.ts` is the one wiring file that names both.
- Keep schema definitions declarative when constraints can express the invariant.
- DB-backed Vitest configs run `src/test-global-setup.ts` to sweep databases from dead test processes,
  then install `src/test-setup.ts` to drain the current file's tracked ephemeral databases in `afterAll`,
  and take `testTimeout`/`hookTimeout` from `databaseTestTimeout` (`src/test-timeout.ts`).

Canonical examples: `src/schema/equipment/product.ts`, `src/database-client.ts`, `src/query-utils.ts`.
