# Jedidah Ops

Monorepo for Jedidah Ops.

The repository is being built in vertical slices. The current app contains email/password auth, the
authenticated app shell, product/customer/supplier/quote/job workflows, audit history, the assistant surface,
shared packages, Drizzle migrations, and root tooling. Current architecture decisions live in
`docs/adr/`.

## Current workspace

```txt
pkg/
  api/     Fastify, Better Auth, tRPC, health/version routes, AI chat stream
  web/     React, Vite, TanStack Router, shadcn/ui, Better Auth client
  schema/  global Zod schemas and types shared across packages
  domain/  shared pure authorization, environment, job, quote, and demo policies
  core/    app service logic for products, customers, suppliers, quotes, jobs, users, and audit
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
AUTH_TRUSTED_ORIGINS=http://localhost:7001,http://localhost:7002,jedidiahops://
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

`pkg/db` contains Better Auth core tables plus app-owned tables for Customers, Suppliers, Parts,
Products, Quotes, Jobs, Documents, Bay scheduling, audit events, and descriptive User Departments.
Jobs are created from accepted Quotes; each Job references exactly one Quote, and each Quote sources
at most one Job. Production progress is represented by Bay Queues and Slots, not Job Stage rows.

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
- `products`, `customers`, `suppliers`, `quotes`, `jobs`, `audit`, and `users` tRPC procedures gated by
  permission-specific procedures

App roles are `admin`, `procurement-manager`, `job-viewer`, `sales`, and `bay-operator`.
Role-to-permission mapping lives in `@pkg/domain/auth/authorization` and is shared between the
Better Auth admin plugin, server procedures, and the web access hooks. Server-side procedures use
`authorizedProcedure(permission)` in `pkg/api/src/trpc/init.ts`; clients use `useAccess` /
`canAccess` in `pkg/web`.

Email/password auth is enabled. Email verification and password reset emails are mocked locally by
recording/logging the generated email payloads unless `EMAIL_PROVIDER=resend` is configured.
Seed users use `stoneybrook` for local sign-in. Demo user identity lives in `@pkg/domain`
(`pkg/domain/src/demo.ts`). Local `pnpm db:seed` imports the deterministic snapshot data from
`pkg/seed/data/staging-snapshot`; remote database reset recreates only the canonical demo users
after migrations.

## Job workflow notes

Jobs are scheduled through Bay Queues:

- The visual pipeline groups Bays by Department: Procurement, Supply, Fabrication, Paint, Assembly.
- A Job has no Stage rows; it appears in a Department while it has Slots on that Department's Bays.
- Slots are whole-day Work or Idle planning blocks. Projected dates are derived plant business dates.
- Job creation is allowed only from an accepted Quote with no existing Job.
- Product Bays can seed initial Work Slots, but Jobs can also be scheduled later from the Gantt.

## Web notes

`pkg/web` currently includes:

- `/login` email/password sign-in only
- `/dashboard` authenticated dashboard shell
- `/products` authenticated product catalog (visible with `product:read`)
- `/customers` authenticated customer directory (visible with `customer:read`)
- `/suppliers` authenticated supplier directory (visible with `supplier:read`)
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
