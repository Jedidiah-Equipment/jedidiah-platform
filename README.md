# Jedidiah Platform

Monorepo for the Jedidiah Equipment platform.

The repository is being built in slices from the stack plan in
[`docs/application-stack-and-hosting.md`](docs/application-stack-and-hosting.md). The current slice
contains email/password auth, the authenticated app shell, product catalog CRUD, shared packages,
Drizzle migrations, and root tooling.

## Current workspace

```txt
pkg/
  api/    Fastify, Better Auth, tRPC, health/version routes, products and users API
  web/    React, Vite, TanStack Router, shadcn/ui, Better Auth client
  schema/ global Zod schemas and types shared across packages
  core/   shared product/user domain logic and authorization rules
  db/     Drizzle schema, migrations, database client, test helpers
  seed/   deterministic local/demo seed orchestration
```

Package names:

- `@pkg/api`
- `@pkg/web`
- `@pkg/schema`
- `@pkg/core`
- `@pkg/db`
- `@pkg/seed`

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
pnpm db:up:template
```

Each runtime package has a committed `.env` containing safe vars. Package `.env.dev` files are not
committed; use them only for sensitive local values or developer-specific overrides. They may be
empty when no sensitive values or overrides are needed.

Default local database URLs:

```txt
DATABASE_URL=postgres://postgres:postgres@localhost:5432/jedidiah
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/jedidiah_template
APP_ENV=development
APP_BASE_URL=http://localhost:7001
API_BASE_URL=http://localhost:7002
AUTH_TRUSTED_ORIGINS=http://localhost:7001,http://localhost:7002
EMAIL_PROVIDER=mock
EMAIL_FROM=noreply@jedidiahequipment.com
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
pnpm db:reset
pnpm db:up:template
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```

## Database notes

Local Postgres uses `postgres:postgres`. The app database is `jedidiah`; the stable test template
database is `jedidiah_template`. Integration tests clone `jedidiah_template` into per-test
ephemeral databases and keep those clone URLs in memory only. Recreate the template with
`pnpm db:up:template`.

Use `pnpm db:reset` to stop Docker Compose, delete the local Postgres volume, and start a fresh
Postgres container. This wipes local database data.

`pkg/db` currently contains Better Auth core tables and the first app-owned table:

- `user` (with a `role` column driving app authorization)
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
- `/api/auth/*` through Better Auth (with the admin plugin enabled)
- `/trpc/*` through tRPC
- `auth.session`, `auth.me`, and `auth.access` tRPC procedures for the current user and permissions
- `products` tRPC procedures for authenticated list/create/update
- `users` tRPC procedures (list, create, and update) gated by `user:list` / `user:edit` permissions

App roles are `admin`, `product-editor`, `job-supervisor`, `job-stage-editor`, and `sales`.
Role-to-permission mapping lives in `@pkg/domain/auth/authorization` and is shared between the
Better Auth admin plugin, server procedures, and the web access hooks. Server-side procedures use
`authorizedProcedure(permission)` in `pkg/api/src/trpc/init.ts`; clients use `useAccess` /
`canAccess` in `pkg/web`.

Email/password auth is enabled. Email verification and password reset emails are mocked locally by
recording/logging the generated email payloads; no real email provider is configured yet.
Seed users use `12345678` for local sign-in. The seeder creates one user per role
(`admin@seed.com`, `pe@seed.com`, `pv@seed.com`) plus deterministic demo products with audit
history.

## Web notes

`pkg/web` currently includes:

- `/login` email/password sign-in only
- `/dashboard` authenticated dashboard shell
- `/products` authenticated product catalog (visible with `product:read`)
- `/users` admin-only user management with role assignment
- `/` auth-based redirect to login or dashboard

Navigation entries and route guards are driven by the same permission set the API enforces; see
`pkg/web/src/hooks/use-access.ts` and `pkg/web/src/lib/access.ts`.

There is intentionally no register, forgot password, password reset, or email verification UI yet.
Public browser config is served through `/env.js` and read from `window.__APP_CONFIG__`.


## Skills

https://github.com/vercel-labs/skills

`npx skills add abc -g -y`
`npx skills list -g`
`npx skills update`
