# db (@pkg/db)

Guidance for database code. Good references are `src/schema/product.ts`,
`src/database-client.ts`, `src/query-utils.ts`, `src/test-utils.ts`, and `drizzle.config.ts`.

## Ownership

- Owns Drizzle schema, generated SQL migrations, Postgres client creation, migration runner, seed
  helper, and database test helpers.
- Drizzle schema lives under `src/schema`; SQL migrations live under `migrations` and are committed.
- Local app DB is `jedidiah`; the stable migrated test template DB is `jedidiah_template`.

## Coding Style Guide

- Keep table modules small and explicit. Export table objects with plural names, such as `products`.
- App-owned tables should generally use UUID primary keys with database defaults.
- Better Auth-owned tables use Better Auth string IDs; keep the `AuthId` naming narrow to that use.
- Put reusable database behavior in focused helpers like `src/query-utils.ts`.
- Use `createDatabaseClient` when code needs an owned Postgres client plus a Drizzle instance.
- Parse DB env through `src/env.ts`; keep direct env reads limited to env and central test helpers.

## Migrations And Test DBs

- Do not use `drizzle-kit push` for production-style changes.
- After schema edits, run `pnpm db:generate` and review the generated SQL before keeping it.
- Run `pnpm db:migrate` for the app DB and `pnpm db:up:template` to rebuild the migrated test
  template when migrations change.
- Tests should clone `jedidiah_template` into per-test ephemeral databases and drop those clones
  after use.

## Verification

- Run `pnpm --filter @pkg/db typecheck`.
- Run `pnpm --filter @pkg/db test`.
- For schema or migration changes, also run root `pnpm db:up`, `pnpm db:migrate`, and
  `pnpm db:up:template`.
- Run root `pnpm lint` for Biome formatting and linting.
