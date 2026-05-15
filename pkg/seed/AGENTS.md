# pkg/seed

- For seed verification, prefer `pnpm db:reset`, but confirm with the user before running it because it rebuilds the local database.
- The seeder is not idempotent; run it against a freshly reset database unless the user explicitly wants duplicate scenario data.
