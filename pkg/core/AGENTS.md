# core (@pkg/core)

Guidance for shared domain and business logic. Good references are
`src/products/product-service.ts`, `src/products/product-errors.ts`, and
`src/products/product-service.test.ts`.

## Ownership

- Owns app-owned domain behavior that should not live in Fastify, tRPC, or React code.
- May depend on `@pkg/schema` for DTO/input types and `@pkg/db` for explicit database interfaces,
  schema, and query utilities.
- Must not depend on browser code, Fastify server setup, Better Auth runtime handlers, or direct
  `process.env` reads.

## Coding Style Guide

- Accept dependencies explicitly, such as `database: Database`; do not hide runtime setup in domain
  functions.
- Keep exported service functions small and intention-revealing: validate at the boundary, query or
  mutate, map rows to DTOs, and throw domain errors for expected business failures.
- Keep row-to-DTO mapping in named helpers such as `mapProduct`.
- Prefer typed domain errors over transport errors. API code maps these to tRPC/HTTP responses.
- Use Drizzle query helpers from `@pkg/db` when they capture a reusable database pattern.
- Export public domain functions and errors from `src/index.ts`.

## Tests

- Unit-test pure helpers directly in this package.
- Put integration-style domain/database coverage here only when the core behavior, not the API
  transport, is the subject.

## Verification

- Run `pnpm --filter @pkg/core typecheck`.
- Run `pnpm --filter @pkg/core test`.
- Run root `pnpm lint` for Biome formatting and linting.
