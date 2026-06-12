# seed (@pkg/seed)

- Confirm before `pnpm db:reset`; it rebuilds the local database.
- `seed-writer.ts` owns local snapshot imports from `data/staging-snapshot`.
- Demo users come from `@pkg/domain/demoUsers`; seed code should not duplicate that roster.
