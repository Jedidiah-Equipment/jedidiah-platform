# seed (@pkg/seed)

- Confirm before `pnpm db:up`; it rebuilds the local database.
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
