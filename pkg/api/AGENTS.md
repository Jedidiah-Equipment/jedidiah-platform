# api (@pkg/api)

Guidance for the backend runtime package. Good references are `src/server.ts`,
`src/trpc/init.ts`, `src/trpc/router.ts`, `src/routes/products/products.router.ts`, and
`src/routes/products/products.router.test.ts`.

## Ownership

- Owns Fastify setup, Better Auth configuration and HTTP handler, tRPC context/router/procedures,
  health/version routes, API env parsing, mocked email, and API-local test harnesses.
- Better Auth HTTP endpoints under `/api/auth/*` are the source of truth for auth mutations.
- tRPC auth procedures should stay app-facing and small, such as session and current-user lookups.
- Email sending is mocked for now. Do not add a real provider unless requested.

## Coding Style Guide

- Keep routers thin: validate input with `@pkg/schema`, call domain/service functions, and map
  expected domain errors to `TRPCError`.
- Put reusable procedure setup in `src/trpc/init.ts`; use `protectedProcedure` for authenticated app
  workflows and `publicProcedure` only when anonymous access is intentional.
- Add feature routers under `src/routes/{feature}/{feature}.router.ts`, then compose them in
  `src/trpc/router.ts`.
- Keep request/runtime concerns in API code. Business logic should live in `@pkg/core` or a focused
  service, and database schema/client details should come from `@pkg/db`.
- Parse env through `src/env.ts`; avoid direct `process.env` reads in feature code.
- Keep Fastify wiring in `src/server.ts` and startup in `src/main.ts`.

## Tests

- For tRPC router/procedure behavior, use the direct caller harness from `src/test/create-tester.ts`.
  Supply a mock session with `context.createCaller()` or test anonymous behavior with
  `context.createAnonCaller()`.
- Do not test tRPC procedures through Fastify unless the HTTP transport itself is the subject.
- Tests clone the migrated template database per test through the API harness; keep DB access on
  `ctx.db`.

## Verification

- Run `pnpm --filter @pkg/api typecheck`.
- Run `pnpm --filter @pkg/api test`.
- Run root `pnpm lint` for Biome formatting and linting.
