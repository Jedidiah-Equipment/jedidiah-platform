# Jedidiah Platform

Monorepo for the Jedidiah Equipment platform.

The repository is being built in slices from the stack plan in
[`docs/application-stack-and-hosting.md`](docs/application-stack-and-hosting.md). The current slice
contains the web app, backend API, shared packages, and root tooling.

## Current workspace

```txt
apps/
  api/    Fastify, Better Auth, tRPC, health/version routes
  web/    React, Vite, TanStack Router, Better Auth client

packages/
  core/   shared schemas, constants, and framework-independent utilities
  db/     Drizzle schema, migrations, database client, and test database helpers
```

Package names:

- `@app/api`
- `@app/web`
- `@app/core`
- `@app/db`

## Requirements

- Node.js `24.x`
- pnpm `10.x`
- Docker, for local Postgres

The repo is strict about Node 24 through `.node-version` and `package.json` engines.

## Setup

```sh
pnpm install
cp .env.example .env.local
docker compose up -d postgres
pnpm db:migrate
pnpm db:migrate:test
```

Default local database URLs:

```txt
DATABASE_URL=postgres://app:app@localhost:5432/app_dev
TEST_DATABASE_URL=postgres://app:app@localhost:5432/app_test
APP_BASE_URL=http://localhost:5173
API_BASE_URL=http://localhost:3000
AUTH_TRUSTED_ORIGINS=http://localhost:5173,http://localhost:3000
PORT=3000
PUBLIC_APP_ENV=development
PUBLIC_APP_BASE_URL=http://localhost:5173
PUBLIC_API_BASE_URL=http://localhost:3000
PUBLIC_AUTH_BASE_URL=http://localhost:3000/api/auth
```

## Common commands

```sh
pnpm typecheck
pnpm check
pnpm test
pnpm build
pnpm env:check
```

Run the API and web app locally:

```sh
pnpm dev
```

Database commands:

```sh
pnpm db:generate
pnpm db:migrate
pnpm db:migrate:test
pnpm db:studio
```

## Database notes

`packages/db` currently contains the Better Auth core tables:

- `user`
- `session`
- `account`
- `verification`

Those auth table IDs are Better Auth-owned string IDs. For app-owned domain tables, prefer UUID
primary keys with database defaults unless there is a specific reason not to.

Generated Drizzle SQL migrations live in `packages/db/migrations` and should be committed with the
schema changes that produced them.

## API notes

`apps/api` exposes:

- `GET /health`
- `GET /api/version`
- `/api/auth/*` through Better Auth
- `/trpc/*` through tRPC

Email/password auth is enabled. Email verification and password reset emails are mocked locally by
recording/logging the generated email payloads; no real email provider is configured yet.

## Web notes

`apps/web` currently includes:

- `/login` email/password sign-in only
- `/dashboard` blank authenticated dashboard shell
- `/` auth-based redirect to login or dashboard

There is intentionally no register, forgot password, password reset, or email verification UI yet.
Public browser config is served through `/env.js` and read from `window.__APP_CONFIG__`.
