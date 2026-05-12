# AGENTS.md

Guidance for coding agents working in this repository.

## Project Shape

- This is a pnpm workspace monorepo.
- Follow [`docs/application-stack-and-hosting.md`](docs/application-stack-and-hosting.md) as the
  source of truth for stack and architecture decisions.
- The current implementation slice includes root tooling, `pkg/api`, `pkg/web`,
  `pkg/schema`, `pkg/core`, `pkg/db`, auth, and product catalog CRUD.
- Do not add CI or deployment files unless the task explicitly asks for the next slice.

## Runtime And Tooling

- Use Node.js `24.x`; the repo intentionally declares `"node": ">=24 <25"`.
- Use pnpm for all package operations.
- Use Biome for linting/formatting. Do not add ESLint or Prettier by default.
- Use Vitest for tests.
- Turborepo orchestrates workspace scripts.
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
  - pure utilities and product business logic
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
  - local shadcn/ui components
  - lean Tailwind styling

## Database Conventions

- Drizzle schema lives under `pkg/db/src/schema`.
- SQL migrations live under `pkg/db/migrations` and are committed.
- Do not use `drizzle-kit push` for production-style changes.
- Use `pnpm db:generate` after schema edits, then review generated SQL.
- Run `pnpm db:migrate` for the app DB and `pnpm db:up:template` to recreate the migrated test
  template DB when touching migrations.
- Local DB names are `jedidiah` for the app DB and `jedidiah_template` for the stable test template
  DB. Tests clone `jedidiah_template` into per-test ephemeral DBs and keep clone URLs in memory.
- Better Auth tables use Better Auth-owned string IDs. Keep `AuthId` narrowly named for that
  purpose.
- App-owned domain tables should generally use UUID primary keys with database defaults.

## Environment

- Parse runtime env through package env modules.
- Do not scatter direct `process.env` access through the codebase.
- Package `.env` files are always committed and must contain only safe values.
- Package `.env.dev` files are not committed; use them for sensitive local values or
  developer-specific overrides. They may be empty when no overrides are needed.
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
- `/products` is the current authenticated app-owned workflow.
- Public browser config comes from `/env.js`; do not use `VITE_*` for deploy-time URLs.
- Use TanStack Form with Zod for forms.
- When reading multiple values or actions from a Zustand store in one component or hook, use one
  selector wrapped with `useShallow` from `zustand/react/shallow`; do not call the store hook
  repeatedly for individual fields.
- Use existing local shadcn/ui components from `pkg/web/src/components/ui` before custom controls.
- Keep styling lean with Tailwind and semantic theme tokens.

## Verification

For normal changes, run:

```sh
pnpm typecheck
pnpm lint
pnpm test
```

For DB schema or migration changes, also run:

```sh
pnpm db:up
pnpm db:migrate
pnpm db:up:template
```

If this shell is not on Node 24, mention the engine warning in the final response.
