# schema (@pkg/schema)

- Keep this package lightweight and framework-independent.
- Do not depend on React, Fastify, Drizzle, Better Auth handlers, or direct `process.env`.
- Own field-level validation here. Consumers must not re-declare constraints that a schema export already owns.
- Use leaf scalars for branded field rules and compose them into entity/API I/O schemas.
- Browser form representations, such as empty strings for nullable fields, belong in `@pkg/web`.
- Business shapes live under `src/equipment/` and ship from `@pkg/schema/equipment`; the root exports only shared scalars, auth, audit, changelog and environment shapes. A shape that names a business entity, even a user-admin one, is a business shape.

Canonical examples: `src/equipment/products/product.ts`, `src/common/pagination.ts`, `src/auth/authorization.ts`.
