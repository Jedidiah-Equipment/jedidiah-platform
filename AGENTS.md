# AGENTS.md

Guidance for coding agents working in this repository.

## Project Shape

- This is a pnpm workspace monorepo.
- Follow [`docs/application-stack-and-hosting.md`](docs/application-stack-and-hosting.md) as the
  source of truth for stack and architecture decisions.
- The current implementation slice includes root tooling, `pkg/api`, `pkg/web`,
  `pkg/schema`, `pkg/core`, and `pkg/db`.
- Do not add CI or deployment files unless the task explicitly asks for the next slice.

## Runtime And Tooling

- Use Node.js `24.x`; the repo intentionally declares `"node": ">=24 <25"`.
- Use pnpm for all package operations.
- Use Biome for linting/formatting. Do not add ESLint or Prettier by default.
- Use Vitest for tests.
- Keep root scripts scoped to packages that exist.

## Code Style

- Use dash-case for folder and non-component file names, such as `some-name.ts`.
- React component files are the exception and should use PascalCase, such as `LoginPage.tsx`.

## Package Boundaries

- `@pkg/schema` is lightweight framework-independent shared schema/type code:
  - global Zod schemas
  - global types derived from Zod
  - no React, Fastify, Drizzle, or direct `process.env` reads
- `@pkg/core` is framework-independent shared code:
  - shared constants
  - pure utilities
  - no React, Fastify, Drizzle, or direct `process.env` reads
- `@pkg/db` owns database concerns:
  - Drizzle schema
  - generated SQL migrations
  - Postgres client
  - migration runner
  - seed and test helpers
- `@pkg/api` owns backend runtime concerns:
  - Fastify server setup
  - Better Auth HTTP handler
  - tRPC router/context
  - health/version routes
  - API env parsing
- `@pkg/web` owns browser runtime concerns:
  - React/Vite app setup
  - TanStack Router routes
  - Better Auth React client
  - runtime public config from `/env.js`
  - lean Tailwind styling

## Database Conventions

- Drizzle schema lives under `pkg/db/src/schema`.
- SQL migrations live under `pkg/db/migrations` and are committed.
- Do not use `drizzle-kit push` for production-style changes.
- Use `pnpm db:generate` after schema edits, then review generated SQL.
- Run `pnpm db:migrate` and `pnpm db:migrate:test` against local Postgres when touching migrations.
- Better Auth tables use Better Auth-owned string IDs. Keep `AuthIdSchema` narrowly named for that
  purpose.
- App-owned domain tables should generally use UUID primary keys with database defaults.

## Environment

- Parse runtime env through package env modules.
- Do not scatter direct `process.env` access through the codebase.
- Current DB/API/web env variables:
  - `NODE_ENV`
  - `DATABASE_URL`
  - `TEST_DATABASE_URL`
  - `APP_BASE_URL`
  - `API_BASE_URL`
  - `AUTH_SECRET`
  - `AUTH_TRUSTED_ORIGINS`
  - `PORT`
  - `APP_ENV`
  - `PUBLIC_APP_BASE_URL`
  - `PUBLIC_API_BASE_URL`
  - `PUBLIC_AUTH_BASE_URL`

## API Conventions

- Better Auth HTTP endpoints under `/api/auth/*` are the source of truth for auth mutations.
- tRPC auth procedures should stay small and app-facing, such as session and current-user lookups.
- Email sending is mocked for now. Do not add a real email provider until explicitly requested.
- Keep email verification optional unless product requirements change.

## Web Conventions

- Login is email/password only for now.
- Do not add register, forgot password, password reset, or email verification UI until requested.
- `/dashboard` is the authenticated app shell and should redirect unauthenticated users to `/login`.
- Public browser config comes from `/env.js`; do not use `VITE_*` for deploy-time URLs.
- Use TanStack Form with Zod for forms.
- Keep styling lean with Tailwind. Do not add shadcn primitives until requested.

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
