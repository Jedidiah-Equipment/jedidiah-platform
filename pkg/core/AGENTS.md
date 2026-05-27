# core (@pkg/core)

Follow `../../.sandcastle/CODING_STANDARDS.md`.

## Copy These

- Product service: `src/products/product-service.ts`
- Product errors: `src/products/product-errors.ts`
- Product tests: `src/products/product-service.test.ts`
- User service: `src/users/user-service.ts`
- Authorization matrix: `src/auth/authorization.ts`

## Notes

- Keep domain behavior here when it should not live in Fastify, tRPC, or React.
- Do not depend on browser code, Fastify setup, Better Auth handlers, or direct `process.env`.
- When list/query results need related data, prefer shaping that related data in the owning service's
  main query using Drizzle relational `with` where practical, instead of adding follow-up queries in
  the router or API layer.
