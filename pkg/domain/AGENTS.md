# domain (@pkg/domain)

## Copy These

- Authorization policy: `src/auth/authorization.ts`
- Public exports: `src/index.ts`

## Notes

- Keep this package lightweight, pure, and browser-safe.
- This package may depend on `@pkg/schema`.
- Do not depend on React, Fastify, Drizzle, Better Auth handlers, database clients, or direct
  `process.env`.
- Put shared domain policy and pure helpers here. Keep Zod schemas in `@pkg/schema`.
