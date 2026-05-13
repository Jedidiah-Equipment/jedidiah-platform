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
