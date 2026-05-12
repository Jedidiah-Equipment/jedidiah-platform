# Jedidiah Platform

Monorepo for the Jedidiah Equipment platform.

The repository is being built in slices from the stack plan in
[`docs/application-stack-and-hosting.md`](docs/application-stack-and-hosting.md). The current slice
contains email/password auth, the authenticated app shell, product catalog CRUD, shared packages,
Drizzle migrations, and root tooling.

## Current workspace

```txt
pkg/
  api/    Fastify, Better Auth, tRPC, health/version routes, product API
  web/    React, Vite, TanStack Router, shadcn/ui, Better Auth client
  schema/ global Zod schemas and types shared across packages
  core/   pure shared utilities and product business logic
  db/     Drizzle schema, migrations, database client, seed/test helpers
```

Package names:

- `@pkg/api`
- `@pkg/web`
- `@pkg/schema`
- `@pkg/core`
- `@pkg/db`

## Requirements

- Node.js `24.x`
- pnpm `10.x`
- Docker, for local Postgres

The repo is strict about Node 24 through `.node-version`, `.nvmrc`, and `package.json` engines.

## Setup

```sh
pnpm install
pnpm db:up
pnpm db:migrate
pnpm db:migrate:test
```

Each runtime package has a committed `.env` containing safe vars. Package `.env.dev` files are not
committed; use them only for sensitive local values or developer-specific overrides. They may be
empty when no sensitive values or overrides are needed.

Default local database URLs:

```txt
DATABASE_URL=postgres://app:app@localhost:5432/app_dev
TEST_DATABASE_URL=postgres://app:app@localhost:5432/app_test
APP_ENV=development
APP_BASE_URL=http://localhost:7001
API_BASE_URL=http://localhost:7002
AUTH_TRUSTED_ORIGINS=http://localhost:7001,http://localhost:7002
PORT=7002
PUBLIC_APP_BASE_URL=http://localhost:7001
PUBLIC_API_BASE_URL=http://localhost:7002
PUBLIC_AUTH_BASE_URL=http://localhost:7002/api/auth
```

## Common commands

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Run the API and web app locally:

```sh
pnpm dev
```

Database commands:

```sh
pnpm db:up
pnpm db:generate
pnpm db:migrate
pnpm db:migrate:test
pnpm db:studio
```

## Database notes

`pkg/db` currently contains Better Auth core tables and the first app-owned table:

- `user`
- `session`
- `account`
- `verification`
- `products`

Those auth table IDs are Better Auth-owned string IDs. For app-owned domain tables, prefer UUID
primary keys with database defaults unless there is a specific reason not to.

Generated Drizzle SQL migrations live in `pkg/db/migrations` and should be committed with the
schema changes that produced them.

## API notes

`pkg/api` exposes:

- `GET /health`
- `GET /api/version`
- `/api/auth/*` through Better Auth
- `/trpc/*` through tRPC
- `products` tRPC procedures for authenticated list/create/update

Email/password auth is enabled. Email verification and password reset emails are mocked locally by
recording/logging the generated email payloads; no real email provider is configured yet.

## Web notes

`pkg/web` currently includes:

- `/login` email/password sign-in only
- `/dashboard` authenticated dashboard shell
- `/products` authenticated product catalog
- `/` auth-based redirect to login or dashboard

There is intentionally no register, forgot password, password reset, or email verification UI yet.
Public browser config is served through `/env.js` and read from `window.__APP_CONFIG__`.
