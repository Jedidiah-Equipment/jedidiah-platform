# Application Stack And Hosting

## Purpose

This document is the source of truth for stack, package boundaries, runtime configuration, and
hosting direction for the Jedidiah platform.

The current implementation is an early full-stack slice: auth, product catalog CRUD, shared schema
and core packages, Drizzle migrations, and local database tooling. CI and production deployment are
still future slices and should not be added unless the task explicitly asks for them.

## Current Stack

```txt
Package manager: pnpm 10
Task runner:     Turborepo
Runtime:         Node.js 24.x
Language:        TypeScript
Frontend:        React 19 + Vite
Routing:         TanStack Router
Server data:     TanStack Query + tRPC React Query
Tables:          TanStack Table
UI:              shadcn/ui local components on Base UI + Tailwind CSS 4
Forms:           TanStack Form + Zod
Auth:            Better Auth
Client state:    Zustand when shared client-only state is needed
API:             Fastify + tRPC
Validation:      Zod
Database:        Postgres
DB layer:        Drizzle
Tests:           Vitest
Lint/format:     Biome
Hosting target:  Railway
```

Use Node.js 24.x everywhere. Bun is not part of the production runtime.

## Repository Layout

```txt
.
  pkg/
    api/      Fastify, Better Auth, tRPC, health/version routes, API env parsing
    web/      React/Vite app, TanStack Router, shadcn/ui components, static server
    schema/   shared Zod schemas and inferred types
    core/     pure shared utilities and business logic
    db/       Drizzle schema, migrations, database client, seed/test helpers

  docs/       architecture notes and product/domain references
  scripts/    local helper scripts

  AGENTS.md
  biome.json
  docker-compose.yml
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  turbo.json
```

Package names:

```txt
@pkg/api
@pkg/web
@pkg/schema
@pkg/core
@pkg/db
```

## Root Tooling

Root scripts are intentionally scoped to existing packages:

```sh
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
pnpm lint:fix
pnpm test
pnpm db:up
pnpm db:reset
pnpm db:up:template
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```

Biome owns linting and formatting. Do not add ESLint or Prettier by default.

Turborepo is used for workspace task orchestration. Do not add Nx.

## Package Boundaries

`@pkg/schema` is lightweight framework-independent shared schema/type code:

- global Zod schemas
- global types derived from Zod
- no React, Fastify, Drizzle, or direct `process.env` reads
- exported Zod values and inferred types use the same PascalCase name with no `Schema` suffix

`@pkg/core` is framework-independent shared code:

- pure utilities and business logic
- shared constants
- no React, Fastify, Drizzle, or direct `process.env` reads
- database-dependent functions may accept explicit database interfaces, but should stay free of
  runtime/server framework concerns

`@pkg/db` owns database concerns:

- Drizzle schema under `pkg/db/src/schema`
- generated SQL migrations under `pkg/db/migrations`
- Postgres client and database client types
- migration runner, seed helper, and test helpers

`@pkg/api` owns backend runtime concerns:

- Fastify server setup
- Better Auth configuration and HTTP handler under `/api/auth/*`
- tRPC router/context/procedure setup
- health/version routes
- API env parsing
- API test harnesses

`@pkg/web` owns browser runtime concerns:

- React/Vite app setup
- TanStack Router routes
- TanStack Query and tRPC client setup
- Better Auth React client
- runtime public config from `/env.js`
- local shadcn/ui components under `src/components/ui`
- lean Tailwind styling

## Frontend App

Path:

```txt
pkg/web
```

Current source layout:

```txt
pkg/web/
  components.json
  index.html
  package.json
  src/
    app/
      Providers.tsx
      router.ts
      route-tree.gen.ts
    components/
      app-shell/
      data-table/
      form/
      ui/
    hooks/
    lib/
    pages/
      dashboard/
      login/
      products/
    providers/
    routes/
    server/
    styles/
```

Current routes:

```txt
/           auth-based redirect
/login      email/password sign-in
/dashboard  authenticated app shell
/products   authenticated product catalog
```

Frontend conventions:

- Use TanStack Router file-based routing.
- Put route wiring, guards, loaders, and redirects in `src/routes`.
- Put page UI in `src/pages/{page-name}/{PageName}Page.tsx`.
- Put page-only components in `src/pages/{page-name}/components`.
- Use TanStack Query for server/cache state.
- Use route search params for shareable URL state such as filters, sorting, tabs, pagination, and
  selected views.
- Use TanStack Form + Zod for forms.
- Use Better Auth's React client for session and auth calls.
- Use local shadcn/ui components before custom controls.
- Use Zustand only for shared client-only UI state that does not belong in the URL or server cache.
- For Zustand selectors that read multiple values/actions in a component or hook, use one selector
  wrapped with `useShallow` from `zustand/react/shallow`.
- Public runtime config comes from `window.__APP_CONFIG__`, populated by `/env.js`.
- Do not use `VITE_*` variables for staging/production URLs.

## Backend App

Path:

```txt
pkg/api
```

Current source layout:

```txt
pkg/api/
  src/
    auth/
    email/
    modules/
      auth/
      products/
    test/
    trpc/
    env.ts
    health.ts
    logger.ts
    main.ts
    router-type.ts
    server.ts
```

Current API surface:

```txt
GET /health
GET /api/version
/api/auth/*
/trpc/*
```

Backend conventions:

- `main.ts` starts the server.
- `server.ts` builds and configures the Fastify instance.
- `health.ts` registers `/health` and `/api/version`.
- `auth/auth.ts` configures Better Auth.
- `auth/handler.ts` mounts Better Auth on `/api/auth/*`.
- `auth/session.ts` reads the current session for tRPC context.
- `trpc/init.ts` creates the tRPC instance and base procedures.
- `trpc/context.ts` builds request context.
- `trpc/router.ts` composes module routers into the app router.
- tRPC inputs must use Zod schemas.
- Routers should stay thin. Business logic belongs in `@pkg/core` or focused service modules.

## Database

Path:

```txt
pkg/db
```

Current Drizzle schemas:

```txt
pkg/db/src/schema/auth.ts
pkg/db/src/schema/product.ts
```

Current migrations live in `pkg/db/migrations` and are committed.

Database conventions:

- Do not use `drizzle-kit push` for production-style changes.
- Use `pnpm db:generate` after schema edits, then review the generated SQL.
- Run `pnpm db:migrate` for the app DB and `pnpm db:up:template` to recreate the migrated test
  template DB when touching migrations.
- Better Auth tables use Better Auth-owned string IDs.
- Keep `AuthId` narrowly named for Better Auth-owned IDs.
- App-owned domain tables should generally use UUID primary keys with database defaults.

## Environment

Runtime env is parsed through package env modules:

```txt
pkg/api/src/env.ts
pkg/db/src/env.ts
pkg/web/src/server/env.ts
pkg/web/src/lib/app-config.ts
```

Committed package `.env` files contain safe defaults. Package `.env.dev` files are ignored and may
be used for sensitive local values or developer-specific overrides.

Do not scatter direct `process.env` reads through the codebase outside env modules and central test
helpers.

Current env variables:

```txt
NODE_ENV
APP_ENV
DATABASE_URL
TEST_DATABASE_URL
APP_BASE_URL
API_BASE_URL
AUTH_SECRET
AUTH_TRUSTED_ORIGINS
PORT
APP_BASE_URL
API_BASE_URL
AUTH_BASE_URL
```

Default local services:

```txt
web: http://localhost:7001
api: http://localhost:7002
postgres: localhost:5432
```

Default local database URLs:

```txt
DATABASE_URL=postgres://postgres:postgres@localhost:5432/jedidiah
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/jedidiah_template
```

Local Postgres uses `postgres:postgres`. `DATABASE_URL` is the `jedidiah` app database.
`TEST_DATABASE_URL` is the stable migrated `jedidiah_template` test template database; integration
tests clone it into per-test ephemeral databases and keep those clone URLs in memory only. Rebuild
the template with `pnpm db:up:template`.

Use `pnpm db:reset` to stop Docker Compose, delete the local Postgres volume, and start a fresh
Postgres container. This wipes local database data.

The web app is a Vite SPA. URLs and public runtime values are served at runtime:

```txt
Railway/system env
  -> pkg/web static server parses env
  -> GET /env.js returns window.__APP_CONFIG__
  -> React reads window.__APP_CONFIG__
```

Anything exposed through `/env.js` is public. Never put secrets in `PUBLIC_*` values.

## Authentication And Authorization

Better Auth is the authentication and session source of truth.

Current auth behavior:

- email/password sign-in
- Better Auth HTTP endpoints under `/api/auth/*`
- tRPC session/current-user lookups
- mocked email sending only
- no register, forgot password, password reset, or email verification UI

Authorization policy is not implemented yet. Follow
[`docs/authorization-architecture.md`](authorization-architecture.md) when that slice begins.

## Domain Direction

The product catalog is the first app-owned domain slice. The larger prototype model for customers,
quotes, jobs, procurement, production stages, service, files, and activity is captured in
[`docs/prototype-domain-erd.md`](prototype-domain-erd.md).

Treat that ERD as a target model, not as a claim about the current database.

## Hosting Direction

Railway remains the intended MVP hosting target:

- one Postgres service
- one API service running `@pkg/api`
- one web service running the `@pkg/web` static server
- Railway environment variables provide runtime config
- Railway autodeploys can be added in a later slice

Do not add CI, deployment workflows, or production infrastructure files until requested.

## Verification

For normal changes:

```sh
pnpm typecheck
pnpm lint
pnpm test
```

For DB schema or migration changes:

```sh
pnpm db:up
pnpm db:migrate
pnpm db:up:template
```
