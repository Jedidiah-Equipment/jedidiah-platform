# core (@pkg/core)

Guidance for shared domain and business logic. Good references are
`src/products/product-service.ts`, `src/products/product-errors.ts`,
`src/products/product-service.test.ts`, `src/users/user-service.ts`, and
`src/auth/authorization.ts`.

## Ownership

- Owns app-owned domain behavior that should not live in Fastify, tRPC, or React code:
  - `products/` — product service, mapping, and domain errors.
  - `users/` — safe user listing plus role-assignment guard helpers used by Better Auth policy.
  - `auth/` — the role/permission matrix, `createUserAccessSummary`, `hasPermission`, and
    `normalizeAppRoles`. These are consumed by the API tRPC layer and the Better Auth admin plugin.
- May depend on `@pkg/schema` for DTO/input types and `@pkg/db` for explicit database interfaces,
  schema, and query utilities.
- Must not depend on browser code, Fastify server setup, Better Auth runtime handlers, or direct
  `process.env` reads.

## Coding Style Guide

- Accept dependencies explicitly, such as `database: Database`; do not hide runtime setup in domain
  functions.
- Keep exported service functions small and intention-revealing: validate at the boundary, query or
  mutate, map rows to DTOs, and throw domain errors for expected business failures.
- Keep row-to-DTO mapping in named helpers such as `mapProduct` and `mapUser`.
- Prefer typed domain errors such as `ProductNotFoundError` for owned domain mutations. User admin
  mutations are owned by Better Auth Admin endpoints; keep app-specific user role invariants as
  focused guard helpers.
- Use Drizzle query helpers from `@pkg/db` when they capture a reusable database pattern; reach for
  transaction-scoped `SELECT ... FOR UPDATE` when invariants like "at least one admin" must hold
  across reads and writes.
- Treat the authorization matrix in `auth/authorization.ts` as the single source of truth for app
  roles and permissions; do not duplicate it elsewhere.
- Export public domain functions and errors from `src/index.ts`.

## Tests

- Unit-test pure helpers directly in this package.
- Put integration-style domain/database coverage here only when the core behavior, not the API
  transport, is the subject.

## Verification

- Run `pnpm --filter @pkg/core typecheck`.
- Run `pnpm --filter @pkg/core test`.
- Run root `pnpm lint` for Biome formatting and linting.
