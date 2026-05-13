# schema (@pkg/schema)

Guidance for shared schemas and types. Good references are `src/products/product.ts`,
`src/pagination/pagination.ts`, `src/auth/auth-id.ts`, `src/auth/authorization.ts`, and
`src/index.ts`.

## Ownership

- Owns lightweight, framework-independent Zod schemas and inferred TypeScript types.
- No React, Fastify, Drizzle, Better Auth runtime handlers, or direct `process.env` reads.
- Use this package for values that cross package, API, URL, form, or runtime-config boundaries.

## Coding Style Guide

- Use same-name PascalCase type/value pairs with no `Schema` suffix:
  `export type Product = z.infer<typeof Product>;` and `export const Product = z.object(...)`.
- Put narrow primitives near the top of a domain schema file, then DTOs, inputs, list/filter values,
  and results.
- Encode normalization at the boundary with Zod, such as `.trim()`, `.default(...)`, and
  `z.coerce` where incoming data is stringly typed.
- Keep reusable primitives in focused folders like `common`, `pagination`, `auth`, `config`, and
  `domain`.
- Use the shared `common/uuid.ts` `Uuid` primitive for app-owned UUID schema fields instead of
  calling `z.uuid()` inline. Keep Better Auth-owned ids on `AuthId`.
- Export public schemas and types from `src/index.ts`.

## Tests

- Add tests next to schemas when the schema carries non-obvious validation, coercion, defaults, or
  branding behavior.

## Verification

- Run `pnpm --filter @pkg/schema typecheck`.
- Run `pnpm --filter @pkg/schema test`.
- Run root `pnpm lint` for Biome formatting and linting.
