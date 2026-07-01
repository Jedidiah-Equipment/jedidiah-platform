# seed (@pkg/seed)

- `pnpm db:up` rebuilds the local database.
- Env split by phase: `seed:read` loads `pkg/seed/.env.dev` (STAGING DB + doc store: `STAGING_DATABASE_URL`,
  `STAGING_DOCUMENT_STORAGE_*`) via `load-read-env.ts`; `seed:write`/`seed:users`/`reset-remote` load
  `pkg/seed/.env` (LOCAL DB + doc store: `DATABASE_URL`, `DOCUMENT_STORAGE_*`) via `load-write-env.ts`. Both
  load without `override` so externally provided env still wins. Keep the loader import above the `@pkg/db`
  import so env is set before `@pkg/db` reads it.
- Doc-store images sync alongside the rows: `seed:read` downloads objects referenced by
  `products.images` and `product_ranges.image`/`logo` from the staging store into
  `data/staging-snapshot/objects/` (gitignored); `seed:write` uploads them to the local store (overwrite,
  so re-seeding is idempotent). A table opts in via `storageFiles` in `snapshot-tables.ts`. Dangling/missing
  objects are warned about and skipped, never fatal.
- `seed-writer.ts` owns local snapshot imports from `data/staging-snapshot`.
- Demo users come from `@pkg/domain/demoUsers`; seed code should not duplicate that roster.
- Seeded user login: every snapshot-seeded `credential` account is inserted with the shared password
  `SEED_USER_PASSWORD` (`test123`) — log in locally as any seeded user with `test123`. Staging password
  hashes are never dumped: `seed-reader.ts` omits the `account.password` column (stored as null) and
  `seed-writer.ts` fills it on insert.
- `seed-reader.ts` reads each snapshot table via `select().from(table)` unless its config sets
  `omitReadColumns` / `readOrderColumn` / `seedRowDefaults` (used when the local schema has columns the
  staging source lacks, e.g. a not-yet-deployed migration). Keep `snapshotTables` ordered parents-first
  so inserts and the reversed cleanup stay FK-safe.
- After `seed:read`, run `pnpm lint:fix` — the writer emits `JSON.stringify` formatting, which Biome
  reformats; otherwise `pnpm verify` fails on the regenerated `data/staging-snapshot/*.json`.
