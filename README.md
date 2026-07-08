# Jedidah Ops

> **Public for portfolio and evaluation only — All Rights Reserved.**
> This repository is published to showcase the author's work. It is **not** licensed for
> use, copying, modification, distribution, deployment, or AI/ML training. See [LICENSE](LICENSE).

Monorepo for Jedidah Ops.

The repository is being built in vertical slices. The current app contains email/password auth, the
authenticated app shell, product/customer/supplier/quote/job workflows, audit history, the assistant surface,
an Expo mobile app, a public lander site, PDF document generation, shared packages, Drizzle migrations,
and root tooling. Current architecture decisions live in `docs/adr/`.

## Current workspace

```txt
pkg/
  api/     Fastify, Better Auth, tRPC, health/version routes, AI chat stream transport
  web/     React, Vite, TanStack Router, shadcn/ui, Better Auth client
  mobile/  Expo (React Native) app with Expo Router and NativeWind
  lander/  public TanStack Start SSR marketing site
  ai/      assistant orchestration: prompts, tool registry, tool handlers, projections
  pdf/     React-PDF renderers for quote documents and product brochures
  schema/  global Zod schemas and types shared across packages
  domain/  shared pure authorization, environment, job, quote, and demo policies
  core/    app service logic for products, customers, suppliers, quotes, jobs, users, and audit
  db/      Drizzle schema, migrations, database client, test helpers
  seed/    deterministic local/demo seed orchestration
```

Package names:

- `@pkg/api`
- `@pkg/web`
- `@pkg/mobile`
- `@pkg/lander`
- `@pkg/ai`
- `@pkg/pdf`
- `@pkg/schema`
- `@pkg/domain`
- `@pkg/core`
- `@pkg/db`
- `@pkg/seed`

## Requirements

- Node.js `24.x`
- pnpm `10.x`
- Docker, for local Postgres and MinIO document storage

The repo is strict about Node 24 through `.node-version`, `.nvmrc`, and `package.json` engines.

## Setup

```sh
pnpm install
pnpm db:up
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
PORT=7002
APP_BASE_URL=http://localhost:7001
API_BASE_URL=http://localhost:7002
AUTH_SECRET=dev-auth-secret-must-be-at-least-32-chars
AUTH_TRUSTED_ORIGINS=http://localhost:7001,http://localhost:7002,http://localhost:7003,jedidiahops://,jedidiahopsstaging://
EMAIL_PROVIDER=mock
EMAIL_FROM=noreply@jedidiahequipment.co.za
DOCUMENT_STORAGE_ENDPOINT=http://localhost:9000
DOCUMENT_STORAGE_BUCKET=jedidiah-documents
DOCUMENT_STORAGE_ACCESS_KEY_ID=minioadmin
DOCUMENT_STORAGE_SECRET_ACCESS_KEY=minioadmin
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.5
OPENAI_REASONING_EFFORT=low
```

Local dev ports: web `7001`, API `7002`, mobile web `7003`, lander `7004`. Parallel slots remap
these to `7N0x` (see `pnpm parallel:up`).

## Common commands

```sh
pnpm verify   # lint + typecheck + build + test
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Run the dev services (API, web, lander, and mobile) locally:

```sh
pnpm dev
```

Database commands:

```sh
pnpm db:up
pnpm db:up:template
pnpm db:generate
pnpm db:migrate
pnpm db:migrate:test
pnpm db:seed
pnpm db:studio
pnpm parallel:up
pnpm parallel:down
```

## Database notes

Local Postgres uses `postgres:postgres`. The app database is `jedidiah`; the stable test template
database is `jedidiah_template`. Integration tests clone `jedidiah_template` into per-test
ephemeral databases and keep those clone URLs in memory only. Recreate the template with
`pnpm db:up:template`.

Use `pnpm db:up` to stop Docker Compose, delete the local Postgres volume, start a fresh Postgres
container, migrate, and seed. This wipes local database data.

Use `pnpm parallel:up` when this checkout needs an isolated local slot. It writes generated ignored
env blocks for the next Docker-free slot, starts that slot's Docker stack, migrates, and seeds it.
Use `pnpm parallel:down` to stop this checkout's dev services, remove that slot's Docker stack and
volumes, and strip generated env blocks while preserving hand-written local env values.

`pkg/db` contains Better Auth core tables plus app-owned tables for Customers, Suppliers, Parts,
Products, Product Ranges, Quotes, Jobs, Documents, stored files, Feedback, Bay scheduling, audit
events, and descriptive User Departments.
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
- `POST /ai/chat-stream` for the authenticated assistant SSE stream (assistant logic lives in `@pkg/ai`)
- authenticated document/file HTTP routes for uploads and downloads
- `auth.session`, `auth.me`, and `auth.access` tRPC procedures for the current user and permissions
- `products`, `productRanges`, `parts`, `customers`, `suppliers`, `quotes`, `jobs`, `audit`, `feedback`,
  and `users` tRPC procedures gated by permission-specific procedures

App roles are `admin`, `super-admin`, `procurement-manager`, `job-viewer`, `sales`, and `bay-operator`.
Role-to-permission mapping lives in `@pkg/domain/auth/authorization` and is shared between the
Better Auth admin plugin, server procedures, and the web access hooks. Server-side procedures use
`authorizedProcedure(permission)` in `pkg/api/src/trpc/init.ts`; clients use `useAccess` /
`canAccess` in `pkg/web`.

Email/password auth is enabled. Email verification and password reset emails are mocked locally by
recording/logging the generated email payloads unless `EMAIL_PROVIDER=resend` is configured.
Seed users use `test123` for local sign-in. Demo user identity lives in `@pkg/domain`
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
- `/product-ranges` authenticated product range management (visible with `product_range:read`)
- `/customers` authenticated customer directory (visible with `customer:read`)
- `/suppliers` authenticated supplier directory (visible with `supplier:read`)
- `/quotes` authenticated quote workflow (visible with `quote:read`)
- `/jobs` authenticated job workflow with list, planning, and calendar views (visible with `job:read`)
- `/bays` authenticated bay management (visible with `job_bay:read`)
- `/audit` authenticated audit history (visible with `audit:read`)
- `/assistant` authenticated AI assistant
- `/feedback` authenticated feedback review (visible with `feedback:read`)
- `/users` admin-only user management with role assignment
- `/forgot-password`, `/reset-password`, and `/verify-email` auth support pages
- `/support` and `/privacy` public info pages
- `/` auth-based redirect to login or dashboard

Navigation entries and route guards are driven by the same permission set the API enforces; see
`pkg/web/src/hooks/use-access.ts` and `pkg/web/src/lib/access.ts`.

There is intentionally no public registration UI yet; user provisioning stays admin-owned.
Public browser config is served through `/env.js` and read from `window.__APP_CONFIG__`.

`pkg/web/vite.config.ts` keeps `resolve.dedupe: ['react', 'react-dom']`. `pkg/mobile` pins a different
React version than web, so without deduping a second React copy can leak into the web bundle and break
hooks ("Invalid hook call" / `useRef` of null). If that error appears after switching branches, clear the
stale Vite cache with `rm -rf node_modules/.vite` and restart the web dev server.

## Agent skills

Agent skills are managed with the Vercel Labs skills CLI:

```sh
npx skills add abc -g -y
npx skills list -g
npx skills update
```

Reference: [`vercel-labs/skills`](https://github.com/vercel-labs/skills)
