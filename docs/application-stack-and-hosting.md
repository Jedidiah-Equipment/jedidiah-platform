# Full-Stack Application Build Template

## Purpose

This document is the build template for the application. It defines the stack, repository structure, package boundaries, deploy model, migration flow, testing strategy, and conventions we will use when scaffolding and building the app.

The default posture is boring, typed, integrated, and easy to operate.

## Stack

```txt
Package manager: pnpm
Monorepo:        pnpm workspaces
Frontend:        React + TypeScript + Vite
Routing:         TanStack Router
Server data:     TanStack Query
UI:              shadcn/ui + Tailwind CSS
Forms:           TanStack Form + Zod
Auth:            Better Auth
Client state:    Zustand only when needed
API:             tRPC
Validation:      Zod
Backend:         Node.js 24 LTS + TypeScript
HTTP server:     Fastify
Database:        Postgres
DB layer:        Drizzle
Tests:           Vitest
Lint/format:     Biome
Hosting:         Railway
Domains:         Railway for MVP
CI/CD:           GitHub Actions + Railway autodeploys
```

Use Node.js 24 LTS in production. Bun is not part of the v1 production runtime. It can be reconsidered later for scripts or local tooling if there is a clear benefit.

## Repository Layout

```txt
.
  pkg/
    web/
      React/Vite frontend

    api/
      Node/Fastify/tRPC backend

    schema/
      global Zod schemas and types

    core/
      shared domain logic, constants, utilities

    db/
      Drizzle schema, migrations, database client, test database helpers

  docs/
    architecture and decisions

  .github/
    workflows/
      ci.yml

  docker-compose.yml
  biome.json
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
```

Package names:

```txt
@pkg/web
@pkg/api
@pkg/schema
@pkg/core
@pkg/db
```

Do not add Turborepo or Nx initially. `pnpm` workspaces are enough for the first version. Add task caching later only if install/build/test time becomes painful.

## Root Files

Root `package.json` owns workspace-level scripts:

```json
{
  "private": true,
  "packageManager": "pnpm@10",
  "engines": {
    "node": ">=24 <25"
  },
  "scripts": {
    "dev": "pnpm --parallel --filter @pkg/api --filter @pkg/web dev",
    "build": "turbo run build",
    "typecheck": "turbo run typecheck",
    "lint": "biome check",
    "lint:fix": "biome check --write",
    "test": "turbo run test",
    "db:generate": "pnpm --filter @pkg/db db:generate",
    "db:migrate": "pnpm --filter @pkg/db build && pnpm --filter @pkg/db db:migrate",
    "db:migrate:test": "pnpm --filter @pkg/db build && NODE_ENV=test pnpm --filter @pkg/db db:migrate",
    "db:studio": "pnpm --filter @pkg/db db:studio"
  }
}
```

Root `biome.json` owns linting and formatting for the workspace. Do not add ESLint or Prettier by default.

Root `pnpm-workspace.yaml`:

```yaml
packages:
  - "pkg/*"
```

Root `tsconfig.base.json` is the shared TypeScript base. Each app/package extends it.

## Frontend App

Path:

```txt
pkg/web
```

Responsibilities:

- Browser app
- Routes and layouts
- TanStack Query setup
- tRPC client setup
- Better Auth React client setup
- shadcn/ui components
- forms and client-side validation
- small client-only state where needed

Frontend structure:

```txt
pkg/web/
  index.html
  package.json
  tsconfig.json
  tsconfig.server.json
  vite.config.ts
  src/
    main.tsx
    app/
      router.tsx
      route-tree.gen.ts
      providers.tsx
    server/
      static.ts
    routes/
      __root.tsx
      index.tsx
    components/
      ui/
        shadcn/ui generated components
      layout/
      shared/
    features/
      auth/
        auth-client.ts
        login.tsx
        signup.tsx
        account.tsx
      example/
        components/
        hooks/
        schemas.ts
        utils.ts
    lib/
      app-config.ts
      env.ts
      query-client.ts
      trpc.ts
      utils.ts
    stores/
      README.md
    styles/
      globals.css
    test/
      setup.ts
```

Frontend package scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build && tsc -p tsconfig.server.json",
    "start": "node dist-server/static.js",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

Frontend conventions:

- Use TanStack Router file-based routing.
- Use route search params for shareable URL state such as filters, sorting, tabs, pagination, and selected views.
- Use TanStack Query for all server/cache state.
- Use React local state for simple component state.
- Use Zustand only for shared client-only UI state that does not belong in the URL or server cache.
- Use TanStack Form + Zod for forms.
- Use Better Auth's React client for sign-in, sign-up, sign-out, and session hooks.
- Use shadcn/ui components as local source code under `src/components/ui`.
- Do not build a marketing landing page as the default first screen. Build the actual app shell.
- Production frontend assets are served by a small Node static server on Railway, not `vite preview`.
- The static server serves `pkg/web/dist` and falls back to `index.html` for client-side routes.
- The static server also serves `/env.js`, which exposes public runtime config from Railway environment variables.
- Deployed frontend code reads public config from `window.__APP_CONFIG__`, not from `import.meta.env`.
- `VITE_*` variables are allowed only for true build-time constants such as build version or commit SHA.

State ownership:

```txt
Server/cache state:         TanStack Query
URL/shareable state:        TanStack Router search params
Form state:                 TanStack Form
Simple local UI state:      useState/useReducer
Shared client-only state:   Zustand, only when needed
Persistent preferences:     localStorage wrapper, only when needed
```

## Backend App

Path:

```txt
pkg/api
```

Responsibilities:

- Fastify HTTP server
- tRPC API
- Better Auth handler
- request context with session/user
- healthcheck endpoints
- domain services
- database-backed integration points

Backend structure:

```txt
pkg/api/
  package.json
  tsconfig.json
  src/
    main.ts
    server.ts
    health.ts
    env.ts
    logger.ts
    auth/
      auth.ts
      handler.ts
      session.ts
    trpc/
      context.ts
      init.ts
      router.ts
      errors.ts
    modules/
      auth/
        auth.router.ts
      example/
        example.router.ts
        example.service.ts
        example.repository.ts
        types.ts
        example.test.ts
    test/
      context.ts
      db.ts
      setup.ts
```

Backend package scripts:

```json
{
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/main.js",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
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
- Domain modules own their own router, service, repository, and schemas.
- Routers should be thin. Business logic belongs in services.
- Database access belongs in repositories or focused query helpers.
- tRPC inputs must use Zod schemas.

## Shared Schema Package

Path:

```txt
pkg/schema
```

Responsibilities:

- global Zod schemas
- global types derived from Zod
- no framework, database, or runtime env dependencies
- exported Zod values and inferred types use the same PascalCase name, with no `Schema` suffix

Structure:

```txt
pkg/schema/
  package.json
  tsconfig.json
  src/
    index.ts
    {domain}/
      {schema-group}.ts
```

Zod definition convention:

```ts
export type ApiConfig = z.infer<typeof ApiConfig>;
export const ApiConfig = z.object({
  DATABASE_URL: z.url(),
});
```

- Always define both the inferred type and the Zod value.
- Put the type definition before the Zod value.
- Use the same PascalCase name for the type and value.
- Do not use a `Schema` suffix.
- Keep package-local schemas in the nearest `types.ts` file to their usage.
- Keep global schemas shared across packages in `pkg/schema/src/{domain}/{schema-group}.ts`.

Schema package scripts:

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

## Shared Core Package

Path:

```txt
pkg/core
```

Responsibilities:

- shared constants
- pure business logic
- framework-independent utilities

Structure:

```txt
pkg/core/
  package.json
  tsconfig.json
  src/
    index.ts
    utils/
```

Core package scripts:

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

Rules:

- No React imports.
- No Fastify imports.
- No Drizzle imports.
- No direct `process.env`.
- Code in this package should be easy to unit test with plain Vitest.

## Database Package

Path:

```txt
pkg/db
```

Responsibilities:

- Drizzle schema
- database client
- migrations
- seed helpers
- test database helpers

Structure:

```txt
pkg/db/
  package.json
  tsconfig.json
  drizzle.config.ts
  migrations/
  src/
    index.ts
    client.ts
    env.ts
    schema/
      index.ts
      auth.ts
      example.ts
    migrate.ts
    seed.ts
    test-utils.ts
```

Database package scripts:

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "node dist/migrate.js",
    "db:migrate:dev": "tsx src/migrate.ts",
    "db:migrate:test": "pnpm build && NODE_ENV=test node dist/migrate.js",
    "db:studio": "drizzle-kit studio"
  }
}
```

Drizzle conventions:

- Schema lives in `pkg/db/src/schema`.
- Migrations live in `pkg/db/migrations`.
- `src/migrate.ts` applies committed migrations with Drizzle's migrator.
- Generated SQL migrations are committed.
- `drizzle-kit generate` is run locally.
- The compiled migrator is run in deploys with `node dist/migrate.js`.
- `drizzle-kit push` is not used in production.

## Environment Variables

Environment variables are parsed through Zod-backed config modules. Each runtime package has a
committed `.env` containing safe vars. Package `.dev.env` files are not committed; use them only for
sensitive local values or developer-specific overrides. They may be empty when no sensitive values
or overrides are needed. Staging and production set runtime values through system env, which takes
precedence over `.env`. Do not read `process.env` throughout the codebase outside env modules and
central test helpers.

Each runtime package owns its env module:

```txt
pkg/web/src/server/env.ts
pkg/web/src/lib/app-config.ts
pkg/api/src/env.ts
pkg/db/src/env.ts
```

Shared variables:

```txt
NODE_ENV
APP_ENV
```

API variables:

```txt
DATABASE_URL
APP_BASE_URL
API_BASE_URL
AUTH_SECRET
AUTH_TRUSTED_ORIGINS
PORT
```

Web runtime variables:

```txt
PUBLIC_APP_BASE_URL
PUBLIC_API_BASE_URL
PUBLIC_AUTH_BASE_URL
PORT
```

Optional web build-time variables:

```txt
VITE_BUILD_VERSION
VITE_COMMIT_SHA
```

The web app is a Vite SPA, so variables accessed through `import.meta.env` are baked into the browser bundle at build time. Do not use `VITE_*` variables for staging/prod URLs.

Use runtime public config instead:

```txt
Railway web service env vars
  -> Node static server parses env through pkg/web/src/server/env.ts
  -> GET /env.js returns window.__APP_CONFIG__
  -> index.html loads /env.js before the app bundle
  -> React reads window.__APP_CONFIG__
```

Example `/env.js` output:

```js
window.__APP_CONFIG__ = {
  appEnv: "staging",
  appBaseUrl: "https://staging-app.example.com",
  apiBaseUrl: "https://staging-api.example.com",
  authBaseUrl: "https://staging-api.example.com/api/auth"
};
```

Anything exposed through `/env.js` is public. Never put secrets in `PUBLIC_*` variables.

Local files:

```txt
.env.example
pkg/api/.env
pkg/db/.env
pkg/web/.env
pkg/*/.dev.env
```

Package `.env` files contain safe committed vars. Package `.dev.env` files and root `.env` files are
ignored. Real secrets are never committed.

## Local Development

Use Docker Compose for local Postgres.

```txt
docker-compose.yml
  postgres service
  app_dev database
  app_test database
```

Local database URLs:

```txt
DATABASE_URL=postgres://app:app@localhost:5432/app_dev
TEST_DATABASE_URL=postgres://app:app@localhost:5432/app_test
```

Typical local flow:

```sh
docker compose up -d postgres
pnpm install
pnpm db:migrate
pnpm dev
```

Default local ports:

```txt
web: http://localhost:7001
api: http://localhost:7002
```

## API Shape

The API is exposed through tRPC under the Fastify server.

Required HTTP routes:

```txt
GET /health
GET /api/version
/trpc/*
```

Use the official Fastify adapter from tRPC:

```txt
@trpc/server/adapters/fastify
```

The tRPC app router is exported from `pkg/api/src/trpc/router.ts`.

The frontend imports only the API router type, not backend runtime code:

```ts
import type { AppRouter } from "@pkg/api/router-type";
```

If exporting the router type directly from `@pkg/api` causes bundling problems, create a type-only export file in the API package and expose it through package `exports`.

## Forms And Validation

Use Zod as the validation source of truth.

Form flow:

```txt
Zod schema
  -> TanStack Form validators
  -> tRPC input schema
  -> service receives validated input
```

Global schemas and shared types used by multiple packages live in `pkg/schema`.

API-only schemas can live next to the relevant API module:

```txt
pkg/api/src/modules/example/types.ts
```

Use the same Zod type/value convention everywhere:

```ts
export type CreateQuoteInput = z.infer<typeof CreateQuoteInput>;
export const CreateQuoteInput = z.object({
  name: z.string().min(1),
});
```

## Testing Strategy

Use Vitest for tests.

Testing layers:

```txt
Unit tests
  -> pure business logic, validation, helpers
  -> no database

Integration tests
  -> tRPC routers, services, Drizzle queries
  -> real Postgres test database

Remote smoke tests
  -> deployed API health and critical read-only checks
  -> Railway environment
```

Frontend testing:

- Logic-focused Vitest tests only.
- Do not add React component render testing by default.
- Test pure logic, utilities, schema validation, state helpers, and extracted hooks.
- If a component contains meaningful business logic, extract that logic and test it directly.

Backend and database testing:

- Drizzle query tests use real Postgres.
- tRPC router tests use a real database-backed test context.
- Do not mock Drizzle by default.
- Reset or truncate test tables before each integration test.
- Insert known data, call the service/router/query, assert returned data and side effects.

Local test flow:

```sh
docker compose up -d postgres
pnpm db:migrate:test
pnpm test
```

CI test flow:

```txt
1. Start a Postgres service container.
2. Install dependencies.
3. Apply Drizzle migrations against a clean test database.
4. Run env checks.
5. Run typecheck.
6. Run Biome checks.
7. Run unit and integration tests.
```

## Database Migrations

Migration development flow:

```txt
1. Update Drizzle schema in pkg/db/src/schema.
2. Run pnpm db:generate.
3. Review generated SQL.
4. Run pnpm --filter @pkg/db db:migrate:dev locally, or run pnpm db:migrate from the repository root.
5. Commit schema and migration files together.
```

Production deployment flow:

```txt
1. Railway builds the API service.
2. Railway runs the API service pre-deploy command.
3. The pre-deploy command applies pending Drizzle migrations.
4. If migrations succeed, Railway starts the new API deployment.
5. Railway healthcheck confirms the API is ready.
6. Traffic moves to the new deployment.
```

Railway API pre-deploy command:

```sh
pnpm --filter @pkg/db db:migrate
```

Migration rules:

- Generate migrations locally.
- Apply migrations during deploy.
- Commit generated SQL migration files.
- Do not use `drizzle-kit push` in production.
- Destructive migrations require manual review.
- Prefer backward-compatible migrations.

Safe migration pattern:

```txt
Deploy 1: add nullable column, new table, or new index
Deploy 2: update application code to use the new structure
Deploy 3: backfill, enforce constraints, or remove old structure
```

## CI/CD

GitHub Actions runs checks on pull requests and main.

Required checks:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm db:migrate:test
pnpm test
pnpm build
```

Railway handles production deploys from `main`.

Deploy services:

```txt
Railway project
  web service
  api service
  postgres service
```

Web service:

```txt
Root directory: repository root
Builder:        Railway Railpack
Build command:  pnpm --filter @pkg/schema build && pnpm --filter @pkg/core build && pnpm --filter @pkg/web build
Start command:  pnpm --filter @pkg/web start
Domain:         app.example.com
```

API service:

```txt
Root directory: repository root
Builder:            Railway Railpack
Build command:      pnpm --filter @pkg/schema build && pnpm --filter @pkg/core build && pnpm --filter @pkg/db build && pnpm --filter @pkg/api build
Start command:      pnpm --filter @pkg/api start
Pre-deploy command: pnpm --filter @pkg/db db:migrate
Healthcheck:        /health
Domain:             api.example.com
```

Use Railway Railpack as the default builder. Do not add Dockerfiles by default.

The web service builds the Vite app and runs a small Node static server.

Static server requirements:

- Listen on the `PORT` value parsed by `pkg/web/src/server/env.ts`.
- Serve files from `pkg/web/dist`.
- Serve `/env.js` from runtime `PUBLIC_*` environment variables.
- Return `index.html` for unknown non-file routes.
- Set basic cache headers for static assets.
- Set `Cache-Control: no-store` for `/env.js`.
- Do not use `vite preview` in production.

Docker and Caddy can be reconsidered later if we need more control over static serving, caching, or image reproducibility.

## Domains

Use Railway domains for the MVP.

```txt
app.example.com  -> web service
api.example.com  -> api service
```

Postgres remains private/internal and does not receive a public domain.

Railway-generated domains are fine for early development:

```txt
web-service.up.railway.app
api-service.up.railway.app
```

Move DNS to Cloudflare later only if the app becomes business-critical or needs advanced DNS, WAF, redirect, caching, or edge controls.

## Environments

Start with:

```txt
development
staging
production
```

Use Railway environments for staging and production. Staging should be a persistent Railway environment with its own web service variables, API service variables, and Postgres database.

Preview environments can wait. For the first version, rely on CI integration tests with real Postgres plus Railway production migrations and healthchecks.

Staging web runtime variables:

```txt
APP_ENV=staging
PUBLIC_APP_BASE_URL=https://staging-app.example.com
PUBLIC_API_BASE_URL=https://staging-api.example.com
PUBLIC_AUTH_BASE_URL=https://staging-api.example.com/api/auth
```

Production web runtime variables:

```txt
APP_ENV=production
PUBLIC_APP_BASE_URL=https://app.example.com
PUBLIC_API_BASE_URL=https://api.example.com
PUBLIC_AUTH_BASE_URL=https://api.example.com/api/auth
```

Because frontend URLs are served through `/env.js`, changing staging or production public web config does not require a Vite rebuild. It does require the web service to run with the updated Railway variables.

## Auth

Use Better Auth for authentication.

Auth stack:

```txt
Auth library:    Better Auth
Storage:         Railway Postgres through Drizzle adapter
Frontend:        better-auth/react client
Backend route:   /api/auth/*
tRPC boundary:   session loaded into context
```

Initial auth features:

```txt
email/password sign-up
email/password sign-in
session cookie auth
sign-out
current session/user lookup
protected tRPC procedures
```

Later auth features can include:

```txt
Google/GitHub OAuth
magic links
2FA
organizations/teams
roles and permissions
```

Backend auth files:

```txt
pkg/api/src/auth/auth.ts
  Better Auth configuration.

pkg/api/src/auth/handler.ts
  Fastify catch-all handler for /api/auth/*.

pkg/api/src/auth/session.ts
  Session lookup helper used by tRPC context.

pkg/api/src/modules/auth/auth.router.ts
  Optional app-specific auth/session procedures.
```

Frontend auth files:

```txt
pkg/web/src/features/auth/auth-client.ts
  Better Auth React client.

pkg/web/src/features/auth/login.tsx
  Login route/component.

pkg/web/src/features/auth/signup.tsx
  Signup route/component.

pkg/web/src/features/auth/account.tsx
  Account/session UI.
```

Database auth files:

```txt
pkg/db/src/schema/auth.ts
  Better Auth Drizzle schema.
```

Better Auth should be configured with the Drizzle adapter and `provider: "pg"`.

Better Auth schema changes must flow through the normal Drizzle migration process:

```txt
1. Generate or update Better Auth Drizzle schema.
2. Run pnpm db:generate.
3. Review generated SQL.
4. Run migration locally.
5. Commit schema and migration files together.
```

Fastify should mount Better Auth at:

```txt
/api/auth/*
```

tRPC context should expose:

```txt
session
user
```

tRPC should define:

```txt
publicProcedure
protectedProcedure
```

Rules:

- App modules should not call Better Auth directly by default.
- Auth state enters application code through tRPC context.
- Protected routes use `protectedProcedure`.
- Auth checks should not be scattered through random modules.
- CORS must allow credentials and restrict origins in production.
- `AUTH_TRUSTED_ORIGINS` should include the deployed web origin and local dev web origin.
- Session cookies should be secure in production.

## Logging And Observability

Use simple structured logging first.

Backend:

- Fastify logger enabled.
- Request IDs included in logs.
- Errors mapped through tRPC error handling.
- `/health` returns basic service status.
- `/api/version` returns app version/build metadata when available.

Frontend:

- Do not add a full observability vendor at scaffold time.
- Add error reporting later when the app has real users.

## What To Avoid Early

Avoid these until there is a concrete need:

- Kubernetes
- Direct AWS/GCP/Azure infrastructure
- Self-hosted Postgres
- Microservices
- Multiple cloud providers
- Complex release trains
- Overbuilt CI/CD
- Redux
- React component render test suites by default
- Production `drizzle-kit push`

## Scaffold Order

Build in this order:

```txt
1. Root pnpm workspace
2. Shared TypeScript config
3. pkg/schema
4. pkg/core
5. pkg/db with Drizzle config and initial schema
6. pkg/api with Fastify, tRPC, health routes, env parsing
7. pkg/web with Vite, TanStack Router, TanStack Query, tRPC client
8. Tailwind CSS and shadcn/ui
9. Docker Compose Postgres
10. Vitest setup
10. GitHub Actions CI
11. Railway service configuration
12. Railway domains
```

This gives us a repeatable build path from empty repo to deployed full-stack application.
