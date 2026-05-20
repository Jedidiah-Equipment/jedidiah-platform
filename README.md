# Jedidiah Platform

Monorepo for the Jedidiah Equipment platform.

The repository is being built in slices from the stack plan in
[`docs/application-stack-and-hosting.md`](docs/application-stack-and-hosting.md). The current app
contains email/password auth, the authenticated app shell, product/customer/quote/job workflows,
audit history, the assistant surface, shared packages, Drizzle migrations, and root tooling.

## Current workspace

```txt
pkg/
  api/     Fastify, Better Auth, tRPC, health/version routes, AI chat stream
  web/     React, Vite, TanStack Router, shadcn/ui, Better Auth client
  schema/  global Zod schemas and types shared across packages
  domain/  shared pure authorization, environment, job, quote, and demo policies
  core/    app service logic for products, customers, quotes, jobs, users, and audit
  db/      Drizzle schema, migrations, database client, test helpers
  seed/    deterministic local/demo seed orchestration
```

Package names:

- `@pkg/api`
- `@pkg/web`
- `@pkg/schema`
- `@pkg/domain`
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
committed; use them for sensitive local values or developer-specific overrides. The API requires an
`OPENAI_API_KEY` when it starts, so keep that in `pkg/api/.env.dev` or another local environment
source.

Default local environment values:

```txt
DATABASE_URL=postgres://postgres:postgres@localhost:5432/jedidiah
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/jedidiah_template
APP_ENV=development
APP_BASE_URL=http://localhost:7001
API_BASE_URL=http://localhost:7002
AUTH_TRUSTED_ORIGINS=http://localhost:7001,http://localhost:7002
EMAIL_PROVIDER=mock
EMAIL_FROM=noreply@jedidiahequipment.co.za
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.5
OPENAI_REASONING_EFFORT=low
PORT=7002
APP_BASE_URL=http://localhost:7001
API_BASE_URL=http://localhost:7002
AUTH_BASE_URL=http://localhost:7002/api/auth
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
pnpm db:migrate:test
pnpm db:seed
pnpm db:studio
```

## Database notes

Local Postgres uses `postgres:postgres`. The app database is `jedidiah`; the stable test template
database is `jedidiah_template`. Integration tests clone `jedidiah_template` into per-test
ephemeral databases and keep those clone URLs in memory only. Recreate the template with
`pnpm db:up:template`.

Use `pnpm db:reset` to stop Docker Compose, delete the local Postgres volume, and start a fresh
Postgres container. This wipes local database data.

`pkg/db` contains Better Auth core tables and app-owned domain tables:

- `user` (with a `role` column driving app authorization)
- `session`
- `account`
- `verification`
- `product`
- `product_options`
- `customers`
- `quotes`
- `job`
- `job_stage`
- `job_event`
- `audit_events`
- `user_department`

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
- `POST /ai/chat-stream` for the authenticated assistant SSE stream
- `auth.session`, `auth.me`, and `auth.access` tRPC procedures for the current user and permissions
- `products`, `customers`, `quotes`, `jobs`, `audit`, and `users` tRPC procedures gated by
  permission-specific procedures

App roles are `admin`, `product-editor`, `job-supervisor`, `job-stage-editor`, and `sales`.
Role-to-permission mapping lives in `@pkg/domain/auth/authorization` and is shared between the
Better Auth admin plugin, server procedures, and the web access hooks. Server-side procedures use
`authorizedProcedure(permission)` in `pkg/api/src/trpc/init.ts`; clients use `useAccess` /
`canAccess` in `pkg/web`.

Email/password auth is enabled. Email verification and password reset emails are mocked locally by
recording/logging the generated email payloads unless `EMAIL_PROVIDER=resend` is configured.
Seed users use `123` for local sign-in. The seeder creates deterministic demo users, products,
customers, quotes, jobs, departments, and audit history.

## Web notes

`pkg/web` currently includes:

- `/login` email/password sign-in only
- `/dashboard` authenticated dashboard shell
- `/products` authenticated product catalog (visible with `product:read`)
- `/customers` authenticated customer directory (visible with `customer:read`)
- `/quotes` authenticated quote workflow (visible with `quote:read`)
- `/jobs` authenticated job workflow (visible with `job:read`)
- `/audit` authenticated audit history (visible with `audit:read`)
- `/assistant` authenticated AI assistant
- `/users` admin-only user management with role assignment
- `/forgot-password`, `/reset-password`, and `/verify-email` auth support pages
- `/` auth-based redirect to login or dashboard

Navigation entries and route guards are driven by the same permission set the API enforces; see
`pkg/web/src/hooks/use-access.ts` and `pkg/web/src/lib/access.ts`.

There is intentionally no public registration UI yet; user provisioning stays admin-owned.
Public browser config is served through `/env.js` and read from `window.__APP_CONFIG__`.

## Agent skills

Agent skills are managed with the Vercel Labs skills CLI:

```sh
npx skills add abc -g -y
npx skills list -g
npx skills update
```

Reference: [`vercel-labs/skills`](https://github.com/vercel-labs/skills)
