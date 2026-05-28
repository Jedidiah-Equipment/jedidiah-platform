# pkg/seed

- For seed verification, prefer `pnpm db:reset`, but confirm with the user before running it because it rebuilds the local database.
- `seed-writer.ts` owns local snapshot imports from `data/staging-snapshot`; leave it as the local `pnpm db:seed` path unless explicitly asked.
- `seed-users.ts` owns demo-user bootstrapping from `@pkg/domain/demoUsers`; it skips existing users by seed ID or email instead of updating them.
- Remote reset (`reset-remote.ts`) should clean/migrate the database and then recreate the canonical demo users.
