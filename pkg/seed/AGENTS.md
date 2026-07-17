# seed (@pkg/seed)

- `pnpm db:up` rebuilds the local database.
- Env split by phase: `seed:read` loads `pkg/seed/.env.dev` and reads the PRODUCTION DB + doc store using
  `PRODUCTION_DATABASE_URL` + `PRODUCTION_DOCUMENT_STORAGE_*`; `seed:read:production` is its explicit alias.
  Use `seed:read:staging` with `STAGING_DATABASE_URL` + `STAGING_DOCUMENT_STORAGE_*` when staging is
  intentionally the source. All read commands use `load-read-env.ts`. `seed:write`/`seed:users`/`reset-remote` load
  `pkg/seed/.env` (LOCAL DB + doc store: `DATABASE_URL`, `DOCUMENT_STORAGE_*`) via `load-write-env.ts`. Both
  load without `override` so externally provided env still wins. Keep the loader import above the `@pkg/db`
  import so env is set before `@pkg/db` reads it.
- Doc-store images sync alongside the rows: all read commands download objects referenced by
  `products.images` and `product_ranges.image`/`logo` from the selected source store into
  `snapshot/objects/` (gitignored); `seed:write` uploads them to the local store (overwrite,
  so re-seeding is idempotent). A table opts in via `storageFiles` in `snapshot-tables.ts`. Dangling/missing
  objects are warned about and skipped, never fatal.
- `seed-writer.ts` owns local snapshot imports from `snapshot`.
- Demo users come from `@pkg/domain/demoUsers`; seed code should not duplicate that roster.
- Seeded user login: every snapshot-seeded `credential` account is inserted with the shared password
  `SEED_USER_PASSWORD` (`test123`) — log in locally as any seeded user with `test123`. Remote password
  hashes are never dumped: `seed-reader.ts` omits the `account.password` column (stored as null) and
  `seed-writer.ts` fills it on insert.
- `seed-reader.ts` reads each snapshot table via `select().from(table)` unless its config sets
  `omitReadColumns` / `readOrderColumn` / `seedRowDefaults` (used when the local schema has columns the
  selected source lacks, e.g. a not-yet-deployed migration). Keep `snapshotTables` ordered parents-first
  so inserts and the reversed cleanup stay FK-safe.
- After any seed read, run `pnpm lint:fix` — the writer emits `JSON.stringify` formatting, which Biome
  reformats; otherwise `pnpm verify` fails on the regenerated `snapshot/*.json`.
