# schema (@pkg/schema)

Follow `../../.sandcastle/CODING_STANDARDS.md`.

## Copy These

- Product schemas: `src/products/product.ts`
- Pagination schemas: `src/pagination/pagination.ts`
- Auth IDs: `src/auth/auth-id.ts`
- Authorization schemas: `src/auth/authorization.ts`
- Public exports: `src/index.ts`

## Notes

- Keep this package lightweight and framework-independent.
- Do not depend on React, Fastify, Drizzle, Better Auth handlers, or direct `process.env`.
