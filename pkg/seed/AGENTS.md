# seed (@pkg/seed)

- `seed-writer.ts` owns local snapshot imports from `snapshot`. Demo users come from
  `@pkg/domain/demoUsers`; seed code must not duplicate that roster.
- After any seed read, run `pnpm lint:fix`. The writer emits `JSON.stringify` formatting that Biome
  reformats, so `pnpm verify` otherwise fails on the regenerated `snapshot/*.json`.

## Env split by phase

- Read commands (`seed:read`, `seed:read:production`, `seed:read:staging`) load `pkg/seed/.env.dev` via
  `load-read-env.ts` and read a **remote** DB + doc store. `seed:read` defaults to production
  (`PRODUCTION_DATABASE_URL` + `PRODUCTION_DOCUMENT_STORAGE_*`); use `seed:read:staging`
  (`STAGING_*`) when staging is intentionally the source.
- Write commands (`seed:write`, `seed:users`, `reset-remote`) load `pkg/seed/.env` via `load-write-env.ts`
  and target the **local** DB + doc store (`DATABASE_URL`, `DOCUMENT_STORAGE_*`).
- Both loaders run without `override`, so externally provided env still wins. Keep the loader import above
  the `@pkg/db` import so env is set before `@pkg/db` reads it.

## Snapshot mechanics

- Doc-store images sync alongside the rows. Read commands download objects referenced by `products.images`
  and `product_ranges.image`/`logo` into `snapshot/objects/` (gitignored); `seed:write` uploads them to the
  local store, overwriting so re-seeding is idempotent. A table opts in via `storageFiles` in
  `snapshot-tables.ts`. Missing or dangling objects warn and skip, never fail.
- `seed-reader.ts` reads each table with `select().from(table)` unless its config sets `omitReadColumns` /
  `readOrderColumn` / `seedRowDefaults` — needed when the local schema has columns the source lacks, such
  as a not-yet-deployed migration. Keep `snapshotTables` ordered parents-first so inserts and the reversed
  cleanup stay FK-safe.
- Remote password hashes are never dumped: `seed-reader.ts` omits `account.password` and `seed-writer.ts`
  fills it on insert with `SEED_USER_PASSWORD` (`test123`), so every seeded user signs in locally with
  `test123`.
