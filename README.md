# Jedidah Ops

> **Public for portfolio and evaluation only — All Rights Reserved.**
> This repository is published to showcase the author's work. It is **not** licensed for
> use, copying, modification, distribution, deployment, or AI/ML training. See [LICENSE](LICENSE).

Monorepo for Jedidah Ops: a manufacturing operations platform covering the quote → job → production-floor
workflow, with a customer-facing marketing site and an Expo mobile app.

- Domain vocabulary and invariants: [CONTEXT.md](CONTEXT.md)
- Architecture decisions: [`docs/adr/`](docs/adr)
- Conventions for working in the repo: [AGENTS.md](AGENTS.md) and each `pkg/*/AGENTS.md`

## Workspace

```txt
pkg/
  api/        Fastify, Better Auth, tRPC, health route, AI chat transport
  web/        React, Vite, TanStack Router, shadcn/ui, Better Auth client
  mobile/     Expo (React Native) app with Expo Router and NativeWind
  lander/     public TanStack Start SSR marketing site
  ai/         assistant orchestration: prompts, tool registration, tool handlers
  pdf/        React-PDF renderers for quote documents and product brochures
  changelog/  release-time changelog generation, validation, and pruning
  schema/     global Zod schemas and types shared across packages
  domain/     shared pure authorization, environment, job, quote, and demo policies
  core/       app service logic for products, customers, suppliers, quotes, jobs, users, and audit
  db/         Drizzle schema, migrations, database client, test helpers
  seed/       deterministic local/demo seed orchestration
```

Each is published in the workspace as `@pkg/<dir>` (`@pkg/api`, `@pkg/web`, and so on).

## Requirements

- Node.js `24.x` — enforced through `.node-version`, `.nvmrc`, and `package.json` engines
- pnpm `10.x`
- Docker, for local Postgres and MinIO document storage

## Setup

```sh
pnpm install
pnpm db:up
pnpm db:up:template
pnpm db:seed
pnpm dev
```

`pnpm dev` runs the API, web, lander, and mobile dev servers. Local ports: web `7001`, API `7002`, mobile
web `7003`, lander `7004`. If this is not your only checkout of the repo, run `pnpm parallel:up` first to
claim an isolated slot with its own Docker stack and remapped `7N0x` ports (see [AGENTS.md](AGENTS.md)).

Seeded users all sign in with the shared password `test123`.

### Environment

Each runtime package has a committed `.env` with safe defaults. Package `.env.dev` files are gitignored;
use them for secrets and developer-specific overrides. The API refuses to start without an
`OPENAI_API_KEY`, so keep that in `pkg/api/.env.dev`.

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

## Commands

```sh
pnpm verify          # lint + typecheck + build + test
pnpm typecheck
pnpm lint
pnpm test
pnpm build

pnpm dev             # API, web, lander, mobile
pnpm dev:kill        # stop this checkout's dev services

pnpm db:up           # rebuild the local database from an empty volume (destroys local data)
pnpm db:up:template  # rebuild the test template database
pnpm db:generate     # generate Drizzle migrations from schema changes
pnpm db:migrate
pnpm db:migrate:test
pnpm db:seed
pnpm db:studio

pnpm parallel:up     # claim an isolated Docker slot for this checkout
pnpm parallel:down
```

`db:seed:staging` replaces staging's database contents with the current local seed tables and copies their
referenced document-store objects. Local defaults come from `pkg/seed/.env`; configure complete `STAGING_*`
and `PRODUCTION_*` counterparts in gitignored `pkg/seed/.env.dev`. The production values are required so the
command can refuse matching production database or object-store targets. All imported credential users
receive the staging seed password `test123`.

## Database

Local Postgres uses `postgres:postgres`. The app database is `jedidiah`; `jedidiah_template` is the stable
test template. Integration tests clone the template into per-test ephemeral databases and keep those clone
URLs in memory only. Generated Drizzle SQL lives in `pkg/db/migrations` and is committed with the schema
change that produced it.

`pkg/db` holds Better Auth core tables plus the app-owned tables. Auth table IDs are Better Auth-owned
strings; app-owned tables use UUID primary keys with database defaults unless there is a reason not to.

## API surface

`pkg/api` exposes `GET /health` (liveness plus deployment metadata), Better Auth at `/api/auth/*` (admin
plugin enabled), tRPC at `/trpc/*`, `POST /ai/chat` for the authenticated assistant stream, and
authenticated document/file routes for uploads and downloads.

App roles are `admin`, `super-admin`, `procurement-manager`, `job-manager`, `job-viewer`, `sales`, `stores`,
and `bay-operator`.
Role-to-permission mapping lives in `@pkg/domain/auth/authorization` and is shared by the Better Auth admin
plugin, server procedures, and the web access hooks. Server procedures use `authorizedProcedure(permission)`
in [pkg/api/src/trpc/init.ts](pkg/api/src/trpc/init.ts); the browser uses `useAccess` / `canAccess` in
`pkg/web`, which is UX only — the API is the authorization boundary. See the Access section of
[CONTEXT.md](CONTEXT.md) for what each role can do.

Auth is email/password only. There is intentionally no public registration UI; user provisioning stays
admin-owned. Verification and password-reset emails are mocked locally unless `EMAIL_PROVIDER=resend` is
configured. Public browser config is served through `/env.js` and read from `window.__APP_CONFIG__`.

## Releases

Production releases fast-forward the `production` branch to a commit already on `origin/main`:

```sh
pnpm release:production:check
pnpm release:production
```

`production` is a release pointer, not a development branch. Every commit on it must be reachable from
`main`; never squash, cherry-pick, resolve conflicts, or create merge commits there. The release script
refuses to push when `production` holds commits that are not on `main`. GitHub protections should disable
deletion and force pushes on `production` and restrict direct pushes to the release actor.

Each release generates a changelog file in [`changelogs/`](changelogs) — see
[`docs/adr/0012-release-time-changelog.md`](docs/adr/0012-release-time-changelog.md). The changelog is
written by a local coding-agent CLI; pass `--agent claude` (or set `CHANGELOG_AGENT=claude`) to use Claude
instead of the default `codex`:

```sh
pnpm release:production:check -- --agent claude
```

## Agent skills

Agent skills are managed with the [Vercel Labs skills CLI](https://github.com/vercel-labs/skills):

```sh
npx skills add abc -g -y
npx skills list -g
npx skills update
```
