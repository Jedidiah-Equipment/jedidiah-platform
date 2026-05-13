# api (@pkg/api)

Guidance for the backend runtime package. Good references are `src/server.ts`,
`src/trpc/init.ts`, `src/trpc/router.ts`, `src/routes/products/products.router.ts`,
`src/routes/users/users.router.ts`, `src/auth/access-control.ts`, and
`src/routes/products/products.router.test.ts`.

## Ownership

- Owns Fastify setup, Better Auth configuration and HTTP handler, tRPC context/router/procedures,
  health/version routes, API env parsing, mocked email, and API-local test harnesses.
- Owns the Better Auth admin-plugin wiring in `src/auth/access-control.ts`, including the role and
  access-control list used by both Better Auth and the tRPC layer.
- Better Auth HTTP endpoints under `/api/auth/*` are the source of truth for auth mutations.
- User create/update/role/password mutations should go through Better Auth Admin APIs, not custom
  tRPC procedures. Keep app-specific Better Auth admin safeguards in focused auth policy hooks.
- tRPC auth procedures should stay app-facing and small, such as session, current-user, and access
  lookups (`auth.session`, `auth.me`, `auth.access`).
- Email sending is mocked for now. Do not add a real provider unless requested.

## Coding Style Guide

- Keep routers thin: validate input with `@pkg/schema`, call domain/service functions, and map
  expected domain errors to `TRPCError`.
- Put reusable procedure setup in `src/trpc/init.ts`. Use `publicProcedure` only when anonymous
  access is intentional, `protectedProcedure` for any authenticated workflow, and
  `authorizedProcedure(permission)` for procedures gated by an `AppPermission` from
  `@pkg/schema/auth/authorization`.
- The tRPC context exposes `ctx.session` (Better Auth session or `null`) and `ctx.access`
  (`UserAccessSummary` or `null`). `authorizedProcedure` narrows both to non-null on success.
- Add feature routers under `src/routes/{feature}/{feature}.router.ts`, then compose them in
  `src/trpc/router.ts`.
- Keep request/runtime concerns in API code. Business logic should live in `@pkg/core` or a focused
  service, and database schema/client details should come from `@pkg/db`.
- Parse env through `src/env.ts`; avoid direct `process.env` reads in feature code.
- Keep Fastify wiring in `src/server.ts` and startup in `src/main.ts`.

## List Procedure Patterns

- Client-side table/list pattern: follow `src/routes/users/users.router.ts` when the API should
  authorize and return a safe full list while the web table owns filter, sort, and pagination.
  Keep the procedure inputless unless the backend truly needs parameters, and keep ordering simple
  and deterministic in `@pkg/core`.
  Do not add user mutation procedures here; call Better Auth Admin from the client/server code that
  owns the mutation workflow.
- Server-side table/list pattern: follow `src/routes/products/products.router.ts` when filter,
  sort, search, and pagination are part of the API contract. Validate a shared list input from
  `@pkg/schema`, pass it to `@pkg/core`, and cover defaults, filtering, sorting, pagination, and
  authorization in direct caller tests.

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
