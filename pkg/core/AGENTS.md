# core (@pkg/core)

- Put domain behavior here when it should not live in Fastify, tRPC, or React.
- Do not depend on browser code, Fastify setup, Better Auth handlers, database clients, or direct `process.env`.
- Shape related data in the owning service query using Drizzle relational `with` where practical; avoid router/API follow-up queries for core-owned reads.
- Export feature-specific errors and type guards beside the behavior that raises them.

Canonical examples: `src/products/product-service.ts`, `src/products/product-errors.ts`, `src/auth/authorization.ts`.
