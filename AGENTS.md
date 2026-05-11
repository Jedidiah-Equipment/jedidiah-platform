# AGENTS.md

Guidance for coding agents working in this repository.

## Project Shape

- This is a pnpm workspace monorepo.
- Follow [`docs/application-stack-and-hosting.md`](docs/application-stack-and-hosting.md) as the
  source of truth for stack and architecture decisions.
- The current implementation slice only includes root tooling, `packages/core`, and `packages/db`.
  Do not add `apps/web`, `apps/api`, CI, or deployment files unless the task explicitly asks for the
  next slice.

## Runtime And Tooling

- Use Node.js `24.x`; the repo intentionally declares `"node": ">=24 <25"`.
- Use pnpm for all package operations.
- Use Biome for linting/formatting. Do not add ESLint or Prettier by default.
- Use Vitest for tests.
- Keep root scripts scoped to packages that exist.

## Package Boundaries

- `@app/core` is framework-independent shared code:
  - Zod schemas
  - shared constants
  - pure utilities
  - no React, Fastify, Drizzle, or direct `process.env` reads
- `@app/db` owns database concerns:
  - Drizzle schema
  - generated SQL migrations
  - Postgres client
  - migration runner
  - seed and test helpers

## Database Conventions

- Drizzle schema lives under `packages/db/src/schema`.
- SQL migrations live under `packages/db/migrations` and are committed.
- Do not use `drizzle-kit push` for production-style changes.
- Use `pnpm db:generate` after schema edits, then review generated SQL.
- Run `pnpm db:migrate` and `pnpm db:migrate:test` against local Postgres when touching migrations.
- Better Auth tables use Better Auth-owned string IDs. Keep `AuthIdSchema` narrowly named for that
  purpose.
- App-owned domain tables should generally use UUID primary keys with database defaults.

## Environment

- Parse runtime env through package env modules.
- Do not scatter direct `process.env` access through the codebase.
- Current DB env variables:
  - `NODE_ENV`
  - `DATABASE_URL`
  - `TEST_DATABASE_URL`

## Verification

For normal changes, run:

```sh
pnpm typecheck
pnpm check
pnpm test
```

For DB schema or migration changes, also run:

```sh
docker compose up -d postgres
pnpm db:migrate
pnpm db:migrate:test
```

If this shell is not on Node 24, mention the engine warning in the final response.
